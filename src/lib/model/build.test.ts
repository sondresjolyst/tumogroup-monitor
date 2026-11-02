import { describe, expect, it } from 'vitest';
import fixture from './fixtures/report.json';
import { parseReport } from '../report/schema';
import { buildModel } from './build';
import type { RenovatePr, WorkflowRun } from './types';

const report = parseReport(fixture);
const now = new Date('2026-11-02T17:00:00Z');
const NEXT_SUNDAY = '2026-11-08T02:15:00.000Z';

const run = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
    id: 1,
    event: 'schedule',
    startedAt: '2026-11-01T02:20:00Z',
    updatedAt: '2026-11-01T02:25:00Z',
    conclusion: 'success',
    ...overrides,
});

const pr = (overrides: Partial<RenovatePr> = {}): RenovatePr => ({
    repo: 'example-org/app-two',
    number: 1,
    title: 'chore(deps): update actions/checkout action to v7.0.2',
    url: 'https://github.com/example-org/app-two/pull/1',
    branch: 'renovate/github-actions',
    createdAt: '2026-10-30T06:00:00Z',
    body: '',
    checks: 'passing',
    labels: [],
    ...overrides,
});

const AUTOMERGE_BODY = 'Schedule text\n\n\u{1F6A6} **Automerge**: Enabled.\n\n♻ **Rebasing**: Whenever PR becomes conflicted';
const MANUAL_BODY = '\u{1F6A6} **Automerge**: Disabled by config. Please merge this manually once you are satisfied.';

const OLD_RUN = run({ id: 9, startedAt: '2026-10-30T02:20:00Z', updatedAt: '2026-10-30T02:25:00Z' });

const build = (prs: RenovatePr[] = [], runs: WorkflowRun[] = [run()]) => buildModel(report, prs, runs, now);
const row = <T extends { dep: string; repo: string }>(rows: T[], repo: string, dep: string) =>
    rows.find((candidate) => candidate.repo === `example-org/${repo}` && candidate.dep === dep);

describe('buildModel updates', () => {
    it('update with open PR on its branch appears only as a PR row', () => {
        const model = build([pr()]);
        expect(model.needsApproval.map((r) => r.number)).toEqual([1]);
        expect(row(model.cooldown, 'app-two', 'actions/checkout')).toBeUndefined();
        expect(row(model.waiting, 'app-two', 'actions/checkout')).toBeUndefined();
        expect(row(build().waiting, 'app-two', 'actions/checkout')).toBeDefined();
    });

    it('pendingChecks with releaseTimestamp goes to cooldown, with daysLeft and expectedPr', () => {
        const apex = row(build().cooldown, 'app-one', 'apexcharts');
        expect(apex?.newVersion).toBe('8.6.0');
        expect(apex?.cooldownEnd).toBe('2026-11-05T13:13:22.526Z');
        expect(apex?.daysLeft).toBeCloseTo(2.84, 2);
        expect(apex?.expectedPr).toBe(NEXT_SUNDAY);
        expect(apex?.tags).toEqual([]);
    });

    it('finished cooldown goes to waiting', () => {
        const model = build();
        const flux = row(model.waiting, 'app-one', 'fluxcd/flux2');
        expect(flux?.expectedPr).toBe(NEXT_SUNDAY);
        expect(flux?.daysLeft).toBeNull();
        expect(row(model.cooldown, 'app-one', 'fluxcd/flux2')).toBeUndefined();
    });

    it('no releaseTimestamp goes to waiting with tag "No release date" and next Sunday as expectedPr', () => {
        const python = row(build().waiting, 'app-one', 'python');
        expect(python?.tags).toEqual(['No release date']);
        expect(python?.releaseTimestamp).toBeNull();
        expect(python?.cooldownEnd).toBeNull();
        expect(python?.expectedPr).toBe(NEXT_SUNDAY);
    });

    it('pin updates go to waiting with no countdown', () => {
        const rxjs = row(build().waiting, 'app-one', 'rxjs');
        expect(rxjs?.updateType).toBe('pin');
        expect(rxjs?.daysLeft).toBeNull();
        expect(rxjs?.cooldownEnd).toBeNull();
        expect(rxjs?.tags).toEqual([]);
        expect(rxjs?.expectedPr).toBe(NEXT_SUNDAY);
    });

    it('major update carries tag "Major" in cooldown and waiting', () => {
        const model = build();
        expect(row(model.cooldown, 'app-one', 'typescript')?.tags).toEqual(['Major']);
        expect(row(model.waiting, 'app-one', 'vite')?.tags).toEqual(['Major']);
    });

    it('same repo, branch, dep and new value in 2 package files gives 1 row', () => {
        const lodash = build().waiting.filter((r) => r.dep === 'lodash');
        expect(lodash).toHaveLength(1);
    });

    it('group rule: a group shows each update own cooldown, and expectedPr uses the first update that has left cooldown, or the earliest cooldown end if none has', () => {
        const model = build();
        const vitest = row(model.cooldown, 'app-two', 'vitest');
        expect(vitest?.cooldownEnd).toBe('2026-11-08T08:00:00.000Z');
        expect(vitest?.expectedPr).toBe(NEXT_SUNDAY);
        expect(row(model.waiting, 'app-two', 'eslint')?.expectedPr).toBe(NEXT_SUNDAY);

        const npgsql = row(model.cooldown, 'app-two', 'Npgsql');
        const serilog = row(model.cooldown, 'app-two', 'Serilog');
        expect(npgsql?.cooldownEnd).toBe('2026-11-08T10:00:00.000Z');
        expect(serilog?.cooldownEnd).toBe('2026-11-06T10:00:00.000Z');
        expect(npgsql?.expectedPr).toBe(NEXT_SUNDAY);
        expect(serilog?.expectedPr).toBe(NEXT_SUNDAY);
    });

    it('a lone update in cooldown past this Sunday expects the Sunday after its cooldown end', () => {
        const typescript = row(build().cooldown, 'app-one', 'typescript');
        expect(typescript?.cooldownEnd).toBe('2026-11-07T09:00:00.000Z');
        expect(typescript?.expectedPr).toBe(NEXT_SUNDAY);
    });

    it('sorts cooldown by cooldown end', () => {
        const ends = build().cooldown.map((r) => r.cooldownEnd);
        expect(ends).toEqual([...ends].sort());
    });
});

describe('buildModel pull requests', () => {
    it('PR body containing "**Automerge**: Enabled" goes to otherPrs', () => {
        const model = build([pr({ body: AUTOMERGE_BODY })]);
        expect(model.otherPrs.map((r) => r.number)).toEqual([1]);
        expect(model.needsApproval).toEqual([]);
    });

    it('PR body with no automerge line goes to needsApproval', () => {
        expect(build([pr({ body: '' })]).needsApproval).toHaveLength(1);
    });

    it('PR body saying automerge is disabled goes to needsApproval', () => {
        const model = build([pr({ body: MANUAL_BODY })]);
        expect(model.needsApproval).toHaveLength(1);
        expect(model.otherPrs).toEqual([]);
    });

    it('PR on a major branch carries tag "Major"', () => {
        const model = build([pr({ repo: 'example-org/app-one', branch: 'renovate/docker-node-26.x' })]);
        expect(model.needsApproval[0].tags).toEqual(['Major']);
    });

    it('PR whose branch holds a no-date update, or that has label "no-release-date", carries tag "No release date" in needsApproval', () => {
        const model = build([
            pr({ number: 1, repo: 'example-org/app-one', branch: 'renovate/java-version-25.x' }),
            pr({ number: 2, repo: 'example-org/app-three', branch: 'renovate/unknown', labels: ['no-release-date'] }),
            pr({ number: 3 }),
        ]);
        const tags = Object.fromEntries(model.needsApproval.map((r) => [r.number, r.tags]));
        expect(tags[1]).toEqual(['No release date']);
        expect(tags[2]).toEqual(['No release date']);
        expect(tags[3]).toEqual([]);
    });

    it('needsApproval sorts majors first, then failing checks, then oldest', () => {
        const model = build([
            pr({ number: 1, repo: 'example-org/app-three', branch: 'renovate/b', createdAt: '2026-10-25T06:00:00Z' }),
            pr({ number: 2, checks: 'failing', createdAt: '2026-10-30T06:00:00Z' }),
            pr({ number: 3, repo: 'example-org/app-one', branch: 'renovate/docker-node-26.x', createdAt: '2026-11-01T06:00:00Z' }),
            pr({ number: 4, repo: 'example-org/app-three', branch: 'renovate/a', createdAt: '2026-10-20T06:00:00Z' }),
        ]);
        expect(model.needsApproval.map((r) => r.number)).toEqual([3, 2, 4, 1]);
    });

    it('otherPrs sorts failing checks first', () => {
        const model = build([
            pr({ number: 1, body: AUTOMERGE_BODY, createdAt: '2026-10-20T06:00:00Z' }),
            pr({ number: 2, body: AUTOMERGE_BODY, checks: 'failing', createdAt: '2026-10-31T06:00:00Z' }),
            pr({ number: 3, body: AUTOMERGE_BODY, checks: 'pending', createdAt: '2026-10-25T06:00:00Z' }),
        ]);
        expect(model.otherPrs.map((r) => r.number)).toEqual([2, 1, 3]);
    });
});

describe('buildModel robustness', () => {
    it('release notes in the PR body cannot hide the config line', () => {
        const body = ['### Release notes', '', '**Automerge**: Enabled', '', '---', '', MANUAL_BODY, ''].join('\n');
        const model = build([pr({ body })]);
        expect(model.needsApproval).toHaveLength(1);
        expect(model.otherPrs).toEqual([]);
    });

    it('a PR takes the source of its update, for the release notes link', () => {
        const model = build([pr({ repo: 'example-org/app-one', branch: 'renovate/vite-9.x' })]);
        expect(model.needsApproval[0].sourceUrl).toBe('https://github.com/example-vendor/vite');
    });

    it('a group PR with several sources has no single source', () => {
        const model = build([pr({ branch: 'renovate/nuget-dependencies' })]);
        expect(model.needsApproval[0].sourceUrl).toBeNull();
    });

    it('a PR on a branch the report does not know has no source', () => {
        const model = build([pr({ branch: 'renovate/unknown' })]);
        expect(model.needsApproval[0].sourceUrl).toBeNull();
    });

    it('a group PR with one source keeps it', () => {
        const model = build([pr({ branch: 'renovate/npm-dependencies' })]);
        expect(model.needsApproval[0].sourceUrl).toBe('https://github.com/example-vendor/lodash');
    });

    it('an unclear or null body goes to needsApproval', () => {
        const model = build([pr({ number: 1, body: null }), pr({ number: 2, body: '**Automerge**: ' })]);
        expect(model.needsApproval.map((r) => r.number).sort()).toEqual([1, 2]);
    });

    it('updates with no branchName do not share one group', () => {
        const raw = structuredClone(fixture) as unknown as { repositories: Record<string, { packageFiles: { npm: { deps: { updates: Record<string, unknown>[] }[] }[] } }> };
        const deps = raw.repositories['example-org/app-one'].packageFiles.npm[0].deps;
        for (const dep of deps) for (const update of dep.updates) delete update.branchName;
        const model = buildModel(parseReport(raw), [], [run()], now);
        const apex = row(model.cooldown, 'app-one', 'apexcharts');
        expect(apex?.expectedPr).toBe(NEXT_SUNDAY);
        expect(row(model.waiting, 'app-one', 'fluxcd/flux2')).toBeDefined();
        expect(row(model.cooldown, 'app-one', 'typescript')?.expectedPr).toBe(NEXT_SUNDAY);
    });

    it('an update inside the cooldown window without pendingChecks goes to waiting', () => {
        const raw = structuredClone(fixture) as unknown as { repositories: Record<string, { packageFiles: { npm: { deps: { depName: string; updates: Record<string, unknown>[] }[] }[] } }> };
        const apex = raw.repositories['example-org/app-one'].packageFiles.npm[0].deps.find((dep) => dep.depName === 'apexcharts');
        delete apex?.updates[0].pendingChecks;
        const model = buildModel(parseReport(raw), [], [run()], now);
        expect(row(model.waiting, 'app-one', 'apexcharts')?.daysLeft).toBeNull();
        expect(row(model.cooldown, 'app-one', 'apexcharts')).toBeUndefined();
    });

    it('an update with no updateType still lists', () => {
        const raw = structuredClone(fixture) as unknown as { repositories: Record<string, { packageFiles: { npm: { deps: { depName: string; updates: Record<string, unknown>[] }[] }[] } }> };
        const flux = raw.repositories['example-org/app-one'].packageFiles.npm[0].deps.find((dep) => dep.depName === 'fluxcd/flux2');
        delete flux?.updates[0].updateType;
        const model = buildModel(parseReport(raw), [], [run()], now);
        expect(row(model.waiting, 'app-one', 'fluxcd/flux2')?.updateType).toBe('unknown');
    });
});

describe('buildModel problems and counts', () => {
    it('problems include isAbandoned deps, deprecated deps, repo problems, and repos with status "disabled"', () => {
        const problems = build().problems;
        const kinds = (kind: string) => problems.filter((p) => p.kind === kind);
        expect(kinds('abandoned').map((p) => [p.repo, p.subject])).toEqual([['example-org/app-one', 'request']]);
        expect(kinds('deprecated').map((p) => [p.repo, p.subject])).toEqual([['example-org/app-one', 'uuidv4']]);
        expect(kinds('deprecated')[0].message).toContain('no longer supported');
        expect(kinds('repo').map((p) => [p.repo, p.message])).toEqual([
            ['example-org/app-three', 'Failed to look up dependency example-package'],
        ]);
        expect(kinds('disabled').map((p) => p.repo)).toEqual(['example-org/archived-tool']);
    });

    it('counts every section', () => {
        const model = build([pr(), pr({ number: 2, body: AUTOMERGE_BODY, branch: 'renovate/other' })]);
        expect(model.counts).toEqual({
            needsApproval: 1,
            cooldown: model.cooldown.length,
            waiting: model.waiting.length,
            otherPrs: 1,
            noReleaseDate: model.waiting.filter((r) => r.tags.includes('No release date')).length,
            problems: 4,
        });
    });
});

describe('buildModel runs and warnings', () => {
    it('warning when no schedule run started on the last Oslo Sunday', () => {
        const model = build([], [OLD_RUN, run({ id: 2, startedAt: '2026-11-02T09:32:55Z', updatedAt: '2026-11-02T09:40:00Z' })]);
        expect(model.warnings.map((w) => w.kind)).toEqual(['no-sunday-run']);
    });

    it('warning when a Sunday schedule run started after that Sunday ended', () => {
        const model = build([], [OLD_RUN, run({ startedAt: '2026-11-01T23:30:00Z', updatedAt: '2026-11-01T23:40:00Z' })]);
        expect(model.warnings.map((w) => w.kind)).toEqual(['late-sunday-run']);
    });

    it('a manual run on Sunday does not count as the schedule run', () => {
        const model = build([], [OLD_RUN, run({ event: 'workflow_dispatch' })]);
        expect(model.warnings.map((w) => w.kind)).toEqual(['no-sunday-run']);
    });

    it('no warning without any runs', () => {
        expect(build([], []).warnings).toEqual([]);
    });

    it('no warning when the run history does not reach back to the last Sunday', () => {
        const model = build([], [run({ id: 2, startedAt: '2026-11-02T09:32:55Z', updatedAt: '2026-11-02T09:40:00Z' })]);
        expect(model.warnings).toEqual([]);
    });

    it('no warning for a run 7h 17m late on a Monday', () => {
        const model = build([], [
            run({ id: 1 }),
            run({ id: 2, startedAt: '2026-11-02T09:32:55Z', updatedAt: '2026-11-02T09:40:00Z' }),
        ]);
        expect(model.warnings).toEqual([]);
    });

    it('run rows show planned slot, actual start, duration, conclusion. Manual runs have no planned slot', () => {
        const model = build([], [
            run({ id: 1 }),
            run({ id: 2, startedAt: '2026-11-02T09:32:55Z', updatedAt: '2026-11-02T09:36:10Z', conclusion: 'failure' }),
            run({ id: 3, event: 'workflow_dispatch', startedAt: '2026-11-02T10:00:00Z', updatedAt: '2026-11-02T10:01:00Z', conclusion: null }),
        ]);
        expect(model.runs).toEqual([
            { id: 3, event: 'workflow_dispatch', plannedSlot: null, startedAt: '2026-11-02T10:00:00.000Z', durationMs: 60000, conclusion: null },
            { id: 2, event: 'schedule', plannedSlot: '2026-11-02T02:15:00.000Z', startedAt: '2026-11-02T09:32:55.000Z', durationMs: 195000, conclusion: 'failure' },
            { id: 1, event: 'schedule', plannedSlot: '2026-11-01T02:15:00.000Z', startedAt: '2026-11-01T02:20:00.000Z', durationMs: 300000, conclusion: 'success' },
        ]);
        expect(model.latestRunAt).toBe('2026-11-02T10:00:00.000Z');
    });

    it('has no latest run time without runs', () => {
        expect(build([], []).latestRunAt).toBeNull();
    });
});

describe('buildModel digest updates and expected problems', () => {
    const digestReport = (dep: Record<string, unknown>, update: Record<string, unknown>) =>
        parseReport({
            problems: [],
            repositories: {
                'example-org/app-nine': {
                    status: 'onboarded',
                    problems: [],
                    branches: [],
                    packageFiles: {
                        dockerfile: [
                            {
                                deps: [
                                    {
                                        depName: 'example/base-image',
                                        ...dep,
                                        updates: [
                                            {
                                                updateType: 'pinDigest',
                                                newValue: '1.2.3',
                                                pendingChecks: true,
                                                branchName: 'renovate/base-image-1.x',
                                                ...update,
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        });

    it('digest update with pending checks is aged by the dependency version timestamp', () => {
        const model = buildModel(
            digestReport({ currentVersionTimestamp: '2026-11-01T18:54:48.000Z' }, {}),
            [],
            [run()],
            now,
        );
        expect(model.cooldown).toHaveLength(1);
        expect(model.cooldown[0].cooldownEnd).toBe('2026-11-08T18:54:48.000Z');
        expect(model.cooldown[0].tags).toEqual([]);
        expect(model.waiting).toHaveLength(0);
    });

    it('digest update with pending checks and no date waits with the No release date tag', () => {
        const model = buildModel(digestReport({}, {}), [], [run()], now);
        expect(model.cooldown).toHaveLength(0);
        expect(model.waiting).toHaveLength(1);
        expect(model.waiting[0].tags).toEqual(['No release date']);
    });

    it('drops the expected releaseTimestamp problems and keeps the others', () => {
        const withProblems = parseReport({
            problems: [],
            repositories: {
                'example-org/app-nine': {
                    status: 'onboarded',
                    problems: [
                        { msg: 'Some release(s) did not have a releaseTimestamp (and so were not subject to minimumReleaseAge)' },
                        { msg: 'Something else broke' },
                    ],
                    branches: [],
                    packageFiles: {},
                },
            },
        });
        const model = buildModel(withProblems, [], [run()], now);
        expect(model.problems.map((problem) => problem.message)).toEqual(['Something else broke']);
        expect(model.counts.problems).toBe(1);
    });
});
