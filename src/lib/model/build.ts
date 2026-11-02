import type { Report, ReportRepository } from '../report/schema';
import { cooldownEnd, lastEndedSunday, nextSundayRun, plannedSlotBefore } from '../schedule';
import {
    MODEL_VERSION,
    type PageModel,
    type PrRow,
    type ProblemRow,
    type RenovatePr,
    type RunRow,
    type Tag,
    type UpdateRow,
    type Warning,
    type WorkflowRun,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTOMERGE_LINE = /^[^\n]*?\*\*Automerge\*\*:[ \t]*([^\n]*)$/gm;
const NO_DATE_LABEL = 'no-release-date';
const PIN_TYPES = new Set(['pin', 'pinDigest']);
const DIGEST_TYPES = new Set(['digest', 'pinDigest']);
const EXPECTED_PROBLEM = /^Some release\(s\) did not have a releaseTimestamp/;
/** The report can be a day older than the PR list, so these branches have had their PR even when none is open now. */
const PR_DONE_RESULTS = new Set(['pr-created', 'pr-edited', 'done', 'automerged', 'already-existed']);

const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', dateStyle: 'medium' });

interface BranchInfo {
    major: boolean;
    noDate: boolean;
    sources: Set<string>;
}

interface Candidate {
    repo: string;
    branch: string;
    dep: string;
    newVersion: string;
    updateType: string;
    sourceUrl: string | null;
    releaseTimestamp: string | null;
    end: Date | null;
    pending: boolean;
    noDate: boolean;
}

interface DatedUpdate {
    updateType?: string | null;
    releaseTimestamp?: string | null;
    pendingChecks?: boolean | null;
    dep?: { currentVersionTimestamp?: string | null };
}

/**
 * Renovate ages a digest update by the date of the ref's newest version,
 * which the report holds as currentVersionTimestamp on the dependency.
 */
function effectiveTimestamp(update: DatedUpdate): string | null {
    if (update.releaseTimestamp) return update.releaseTimestamp;
    const type = update.updateType ?? '';
    return DIGEST_TYPES.has(type) ? (update.dep?.currentVersionTimestamp ?? null) : null;
}

function isNoDate(update: DatedUpdate): boolean {
    if (effectiveTimestamp(update)) return false;
    const type = update.updateType ?? '';
    if (DIGEST_TYPES.has(type) && update.pendingChecks === true) return true;
    return !PIN_TYPES.has(type);
}

/** Renovate writes its own config line after the release notes, so only the last match counts. */
function automergeEnabled(body: string | null | undefined): boolean {
    const matches = [...(body ?? '').matchAll(AUTOMERGE_LINE)];
    return matches.at(-1)?.[1].startsWith('Enabled') ?? false;
}

function* eachUpdate(repository: ReportRepository) {
    for (const files of Object.values(repository.packageFiles)) {
        for (const file of files) {
            for (const dep of file.deps) {
                for (const update of dep.updates) yield { ...update, dep };
            }
        }
    }
}

function branchInfos(repository: ReportRepository): Map<string, BranchInfo> {
    const infos = new Map<string, BranchInfo>();
    const info = (branch: string): BranchInfo => {
        let found = infos.get(branch);
        if (!found) infos.set(branch, (found = { major: false, noDate: false, sources: new Set() }));
        return found;
    };
    for (const branch of repository.branches) {
        if (branch.upgrades.some((upgrade) => upgrade.updateType === 'major')) info(branch.branchName).major = true;
    }
    for (const update of eachUpdate(repository)) {
        const found = info(update.branchName ?? '');
        if (update.updateType === 'major') found.major = true;
        if (isNoDate(update)) found.noDate = true;
        if (update.dep.sourceUrl) found.sources.add(update.dep.sourceUrl);
    }
    return infos;
}

function candidates(repo: string, repository: ReportRepository, openBranches: Set<string>, now: Date): Candidate[] {
    const prDone = new Set(repository.branches.filter((branch) => PR_DONE_RESULTS.has(branch.result ?? '')).map((branch) => branch.branchName));
    const seen = new Set<string>();
    const found: Candidate[] = [];
    for (const update of eachUpdate(repository)) {
        const branch = update.branchName ?? '';
        if (openBranches.has(`${repo}\n${branch}`)) continue;
        const newVersion = update.newValue ?? update.newVersion ?? '';
        const key = [branch, update.dep.depName, newVersion].join('\n');
        if (seen.has(key)) continue;
        seen.add(key);
        const timestamp = effectiveTimestamp(update);
        const end = timestamp ? cooldownEnd(timestamp) : null;
        const pending = update.pendingChecks === true && end !== null && end.getTime() > now.getTime();
        // A pending update is not in the branch's PR, so it keeps its place in cooldown.
        if (prDone.has(branch) && !pending) continue;
        found.push({
            repo,
            branch,
            dep: update.dep.depName,
            newVersion,
            updateType: update.updateType ?? 'unknown',
            sourceUrl: update.dep.sourceUrl ?? null,
            releaseTimestamp: timestamp,
            end,
            noDate: isNoDate(update),
            pending,
        });
    }
    return found;
}

function updateRows(report: Report, openBranches: Set<string>, now: Date) {
    const cooldown: UpdateRow[] = [];
    const waiting: UpdateRow[] = [];
    for (const [repo, repository] of Object.entries(report.repositories)) {
        for (const candidate of candidates(repo, repository, openBranches, now)) {
            const tags: Tag[] = [];
            if (candidate.updateType === 'major') tags.push('Major');
            if (candidate.noDate) tags.push('No release date');
            const row: UpdateRow = {
                repo,
                branch: candidate.branch,
                dep: candidate.dep,
                newVersion: candidate.newVersion,
                updateType: candidate.updateType,
                sourceUrl: candidate.sourceUrl,
                dashboardIssue: repository.dependencyDashboardIssue ?? null,
                tags,
                releaseTimestamp: candidate.releaseTimestamp,
                cooldownEnd: candidate.end?.toISOString() ?? null,
                daysLeft: candidate.pending ? (candidate.end!.getTime() - now.getTime()) / DAY_MS : null,
                // Renovate drops pending updates from a ready branch, so a pending update never comes before its own cooldown ends.
                expectedPr: nextSundayRun(candidate.pending ? candidate.end! : now).toISOString(),
            };
            (candidate.pending ? cooldown : waiting).push(row);
        }
    }
    const byName = (a: UpdateRow, b: UpdateRow) => a.repo.localeCompare(b.repo) || a.dep.localeCompare(b.dep);
    cooldown.sort((a, b) => a.cooldownEnd!.localeCompare(b.cooldownEnd!) || byName(a, b));
    waiting.sort(byName);
    return { cooldown, waiting };
}

function prRows(report: Report, prs: RenovatePr[]) {
    const infos = new Map<string, Map<string, BranchInfo>>();
    const needsApproval: PrRow[] = [];
    const otherPrs: PrRow[] = [];
    for (const pr of prs) {
        const repository = report.repositories[pr.repo];
        if (repository && !infos.has(pr.repo)) infos.set(pr.repo, branchInfos(repository));
        const info = infos.get(pr.repo)?.get(pr.branch);
        const tags: Tag[] = [];
        if (info?.major) tags.push('Major');
        if (info?.noDate || pr.labels.includes(NO_DATE_LABEL)) tags.push('No release date');
        const row: PrRow = {
            repo: pr.repo,
            number: pr.number,
            title: pr.title,
            url: pr.url,
            branch: pr.branch,
            createdAt: pr.createdAt,
            checks: pr.checks,
            tags,
            // A group with several sources has no one page for its notes. They are in the PR.
            sourceUrl: info?.sources.size === 1 ? [...info.sources][0] : null,
        };
        (automergeEnabled(pr.body) ? otherPrs : needsApproval).push(row);
    }
    const failing = (row: PrRow) => (row.checks === 'failing' ? 0 : 1);
    const major = (row: PrRow) => (row.tags.includes('Major') ? 0 : 1);
    const oldest = (a: PrRow, b: PrRow) => a.createdAt.localeCompare(b.createdAt);
    needsApproval.sort((a, b) => major(a) - major(b) || failing(a) - failing(b) || oldest(a, b));
    otherPrs.sort((a, b) => failing(a) - failing(b) || oldest(a, b));
    return { needsApproval, otherPrs };
}

function problemText(problem: unknown): string {
    if (typeof problem === 'string') return problem;
    if (problem && typeof problem === 'object') {
        if ('msg' in problem && typeof problem.msg === 'string') return problem.msg;
        if ('message' in problem && typeof problem.message === 'string') return problem.message;
    }
    return 'Renovate reported a problem';
}

const isExpected = (problem: unknown) => EXPECTED_PROBLEM.test(problemText(problem));

function problemRows(report: Report): ProblemRow[] {
    const rows: ProblemRow[] = report.problems.filter((problem) => !isExpected(problem)).map((problem) => ({
        kind: 'report',
        repo: null,
        subject: null,
        message: problemText(problem),
    }));
    for (const [repo, repository] of Object.entries(report.repositories)) {
        if (repository.status === 'disabled') {
            rows.push({ kind: 'disabled', repo, subject: null, message: 'Renovate is disabled for this repository' });
        }
        for (const problem of repository.problems) {
            if (isExpected(problem)) continue;
            rows.push({ kind: 'repo', repo, subject: null, message: problemText(problem) });
        }
        const seen = new Set<string>();
        for (const files of Object.values(repository.packageFiles)) {
            for (const file of files) {
                for (const dep of file.deps) {
                    const found: ProblemRow[] = [];
                    if (dep.isAbandoned) {
                        found.push({ kind: 'abandoned', repo, subject: dep.depName, message: 'The package looks abandoned' });
                    }
                    if (dep.deprecationMessage) {
                        found.push({ kind: 'deprecated', repo, subject: dep.depName, message: dep.deprecationMessage });
                    }
                    for (const row of found) {
                        const key = `${row.kind}\n${row.subject}`;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        rows.push(row);
                    }
                }
            }
        }
    }
    return rows;
}

export function runRows(runs: WorkflowRun[]): RunRow[] {
    return runs
        .map((run) => {
            const startedAt = new Date(run.startedAt);
            return {
                id: run.id,
                event: run.event,
                headBranch: run.headBranch,
                plannedSlot: run.event === 'schedule' ? plannedSlotBefore(startedAt).toISOString() : null,
                startedAt: startedAt.toISOString(),
                durationMs: Math.max(0, new Date(run.updatedAt).getTime() - startedAt.getTime()),
                conclusion: run.conclusion,
            };
        })
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function sundayWarnings(runs: WorkflowRun[], now: Date): Warning[] {
    const { start, end } = lastEndedSunday(now);
    const oldest = Math.min(...runs.map((run) => new Date(run.startedAt).getTime()));
    if (runs.length === 0 || oldest > start.getTime()) return [];
    const scheduled = runs.filter((run) => run.event === 'schedule');
    const starts = scheduled.map((run) => new Date(run.startedAt));
    const inWindow = (date: Date) => date >= start && date < end;
    const sunday = dateFormat.format(start);
    if (starts.some(inWindow)) {
        if (scheduled.some((run) => run.conclusion === 'success' && inWindow(new Date(run.startedAt)))) return [];
        return [{ kind: 'failed-sunday-run', message: `No scheduled run succeeded on Sunday ${sunday}.` }];
    }
    if (starts.some((date) => date >= end && inWindow(plannedSlotBefore(date)))) {
        return [{ kind: 'late-sunday-run', message: `The scheduled run for Sunday ${sunday} started after the day had ended.` }];
    }
    return [{ kind: 'no-sunday-run', message: `No scheduled run started on Sunday ${sunday}.` }];
}

export function buildModel(report: Report, prs: RenovatePr[], runs: WorkflowRun[], now: Date): PageModel {
    const openBranches = new Set(prs.map((pr) => `${pr.repo}\n${pr.branch}`));
    const { cooldown, waiting } = updateRows(report, openBranches, now);
    const { needsApproval, otherPrs } = prRows(report, prs);
    const problems = problemRows(report);
    const noReleaseDate = [...needsApproval, ...otherPrs, ...waiting].filter((row) => row.tags.includes('No release date')).length;
    return {
        modelVersion: MODEL_VERSION,
        counts: {
            needsApproval: needsApproval.length,
            cooldown: cooldown.length,
            waiting: waiting.length,
            otherPrs: otherPrs.length,
            noReleaseDate,
            problems: problems.length,
        },
        needsApproval,
        cooldown,
        waiting,
        otherPrs,
        problems,
        warnings: sundayWarnings(runs, now),
    };
}
