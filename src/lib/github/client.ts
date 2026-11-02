import { createSign } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { redact } from '@/lib/redact';
import type { ChecksState, RenovatePr, WorkflowRun } from '@/lib/model/types';

const OWNER = 'sondresjolyst';
const CONFIG_REPO = 'si-renovate-config';
export const CONFIG_REPO_URL = `https://github.com/${OWNER}/${CONFIG_REPO}`;
const WORKFLOW_FILE = 'renovate.yml';
const REPORT_ARTIFACT = 'renovate-report';
const PR_QUERY = `is:pr is:open author:app/sjolyst-innovation-renovate user:${OWNER}`;
const DEFAULT_API_URL = 'https://api.github.com';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const MAX_REPORT_BYTES = 100 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 1000;
const REPORT_FILE = 'report.json';

/** Reads GITHUB_APP_ID, GITHUB_PRIVATE_KEY, and optionally GITHUB_API_URL and GITHUB_TIMEOUT_MS. */
export type ClientEnv = Record<string, string | undefined>;

export interface GitHubClient {
    listRuns(): Promise<WorkflowRun[]>;
    downloadLatestReport(): Promise<{ runId: number; raw: unknown } | null>;
    listOpenRenovatePrs(): Promise<RenovatePr[]>;
}

/** An error whose message is safe to show on the page. It never holds a response body. */
export class GitHubError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GitHubError';
    }
}

export function normalizePrivateKey(value: string): string {
    return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

export { redact };

const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function appJwt(appId: string, privateKey: string, nowMs: number): string {
    const seconds = Math.floor(nowMs / 1000);
    const head = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({ iat: seconds - 60, exp: seconds + 9 * 60, iss: appId }));
    try {
        const signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(privateKey);
        return `${head}.${claims}.${base64url(signature)}`;
    } catch {
        throw new GitHubError('The GitHub App private key could not be read');
    }
}

const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure']);
const CHECK_CONCURRENCY = 5;
const MAX_CHECK_PAGES = 20;

export interface CheckRun {
    status: string;
    conclusion: string | null;
}

export interface CombinedStatus {
    state: string;
    total_count: number;
}

/** Combines check runs and the commit status into one state. The status state reads pending when it has no contexts. */
export function deriveChecks(runs: CheckRun[], status: CombinedStatus): ChecksState {
    if (runs.some((run) => run.conclusion !== null && FAILED_CONCLUSIONS.has(run.conclusion))) return 'failing';
    if (status.total_count > 0 && (status.state === 'failure' || status.state === 'error')) return 'failing';
    if (runs.some((run) => run.status !== 'completed')) return 'pending';
    if (status.total_count > 0 && status.state === 'pending') return 'pending';
    if (runs.length > 0 || status.total_count > 0) return 'passing';
    return 'none';
}

interface PrNode {
    number: number;
    title: string;
    url: string;
    headRefName: string;
    headRefOid: string | null;
    createdAt: string;
    body: string | null;
    repository: { nameWithOwner: string };
    labels: { nodes: Array<{ name: string }> } | null;
}

interface SearchResponse {
    data?: {
        search: {
            issueCount: number;
            nodes: Array<PrNode | null>;
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
        } | null;
    } | null;
    errors?: Array<{ type?: string; message?: string }> | null;
}

const SEARCH = `query($query: String!, $after: String) {
  search(query: $query, type: ISSUE, first: 50, after: $after) {
    issueCount
    nodes {
      ... on PullRequest {
        number title url headRefName headRefOid createdAt body
        repository { nameWithOwner }
        labels(first: 20) { nodes { name } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

interface RunsResponse {
    workflow_runs: Array<{
        id: number;
        event: string;
        status: string;
        conclusion: string | null;
        created_at: string;
        head_branch?: string | null;
        head_repository?: { full_name?: string } | null;
        run_started_at?: string | null;
        updated_at: string;
    }>;
}

interface ArtifactsResponse {
    artifacts: Array<{ id: number; name: string; expired: boolean }>;
}

/** Runs the work for every item with at most `limit` calls at once. The first failure stops the rest. */
async function mapLimited<T>(items: T[], limit: number, work: (item: T, index: number) => Promise<void>): Promise<void> {
    let next = 0;
    let failed = false;
    const worker = async () => {
        while (!failed && next < items.length) {
            const index = next++;
            try {
                await work(items[index], index);
            } catch (error) {
                failed = true;
                throw error;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function parseReportFile(bytes: Uint8Array): unknown {
    let found = false;
    let tooBig = false;
    let files: Record<string, Uint8Array>;
    try {
        files = unzipSync(bytes, {
            filter: (file) => {
                if (file.name !== REPORT_FILE) return false;
                found = true;
                if (file.originalSize > MAX_REPORT_BYTES) {
                    tooBig = true;
                    return false;
                }
                return true;
            },
        });
    } catch {
        throw new GitHubError('The GitHub report artifact could not be unpacked');
    }
    if (tooBig) throw new GitHubError('The GitHub report artifact is too large once unpacked');
    if (!found || !files[REPORT_FILE]) throw new GitHubError(`The GitHub report artifact has no ${REPORT_FILE}`);
    const data = files[REPORT_FILE];
    if (data.byteLength > MAX_REPORT_BYTES) throw new GitHubError('The GitHub report artifact is too large once unpacked');
    try {
        return JSON.parse(strFromU8(data)) as unknown;
    } catch {
        throw new GitHubError(`The GitHub ${REPORT_FILE} is not valid JSON`);
    }
}

export function createClient(env: ClientEnv): GitHubClient {
    const appId = env.GITHUB_APP_ID?.trim();
    if (!appId) throw new GitHubError('GITHUB_APP_ID is not set');
    if (!env.GITHUB_PRIVATE_KEY?.trim()) throw new GitHubError('GITHUB_PRIVATE_KEY is not set');
    const privateKey = normalizePrivateKey(env.GITHUB_PRIVATE_KEY);
    const apiUrl = (env.GITHUB_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
    const timeoutMs = Number(env.GITHUB_TIMEOUT_MS) > 0 ? Number(env.GITHUB_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
    let token: string | null = null;

    async function request<T>(
        label: string,
        path: string,
        auth: string,
        init: { method?: string; body?: string } = {},
        read: (response: Response) => Promise<T> = (response) => response.json() as Promise<T>,
    ): Promise<T> {
        try {
            const response = await fetch(`${apiUrl}${path}`, {
                method: init.method ?? 'GET',
                body: init.body,
                signal: AbortSignal.timeout(timeoutMs),
                headers: {
                    authorization: `Bearer ${auth}`,
                    accept: 'application/vnd.github+json',
                    'x-github-api-version': '2022-11-28',
                    'user-agent': 'tumogroup-monitor',
                    ...(init.body ? { 'content-type': 'application/json' } : {}),
                },
            });
            if (!response.ok) throw new GitHubError(`GitHub ${label} failed with status ${response.status}`);
            return await read(response);
        } catch (error) {
            if (error instanceof GitHubError) throw error;
            if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
                throw new GitHubError(`GitHub ${label} timed out after ${timeoutMs} ms`);
            }
            throw new GitHubError(`GitHub ${label} failed`);
        }
    }

    async function installationToken(): Promise<string> {
        if (token) return token;
        const jwt = appJwt(appId as string, privateKey, Date.now());
        const installations = await request<Array<{ id: number; account: { login: string } | null }>>(
            'finding the GitHub App installation',
            '/app/installations?per_page=100',
            jwt,
        );
        const installation = installations.find((item) => item.account?.login === OWNER);
        if (!installation) throw new GitHubError(`The GitHub App is not installed for ${OWNER}`);
        const created = await request<{ token: string }>(
            'creating the installation token',
            `/app/installations/${installation.id}/access_tokens`,
            jwt,
            { method: 'POST' },
        );
        token = created.token;
        return token;
    }

    const actions = `/repos/${OWNER}/${CONFIG_REPO}/actions`;

    async function fetchRuns(): Promise<RunsResponse['workflow_runs']> {
        const response = await request<RunsResponse>(
            'listing workflow runs',
            `${actions}/workflows/${WORKFLOW_FILE}/runs?per_page=50`,
            await installationToken(),
        );
        return response.workflow_runs;
    }

    async function fetchChecks(repo: string, sha: string): Promise<ChecksState> {
        const base = `/repos/${repo}/commits/${sha}`;
        const runs: CheckRun[] = [];
        for (let page = 1; page <= MAX_CHECK_PAGES; page++) {
            const response = await request<{ total_count: number; check_runs: CheckRun[] }>(
                'check run lookup',
                `${base}/check-runs?per_page=100&page=${page}`,
                await installationToken(),
            );
            if (!Array.isArray(response.check_runs)) throw new GitHubError('GitHub check run lookup returned incomplete data');
            runs.push(...response.check_runs);
            if (response.check_runs.length === 0 || runs.length >= response.total_count) break;
            if (page === MAX_CHECK_PAGES) throw new GitHubError('GitHub check run lookup returned too many pages');
        }
        const status = await request<CombinedStatus>('commit status lookup', `${base}/status`, await installationToken());
        if (typeof status.total_count !== 'number') throw new GitHubError('GitHub commit status lookup returned incomplete data');
        return deriveChecks(runs, status);
    }

    return {
        async listRuns() {
            const runs = await fetchRuns();
            return runs.map((run) => ({
                id: run.id,
                event: run.event,
                startedAt: run.run_started_at ?? run.created_at,
                updatedAt: run.updated_at,
                conclusion: run.conclusion,
            }));
        },

        async downloadLatestReport() {
            const runs = (await fetchRuns()).filter(
                (run) =>
                    run.status === 'completed' &&
                    run.conclusion === 'success' &&
                    run.head_branch === 'main' &&
                    run.head_repository?.full_name === `${OWNER}/${CONFIG_REPO}`,
            );
            for (const run of runs) {
                const list = await request<ArtifactsResponse>(
                    'listing report artifacts',
                    `${actions}/runs/${run.id}/artifacts?per_page=100`,
                    await installationToken(),
                );
                const artifact = list.artifacts.find((item) => item.name === REPORT_ARTIFACT && !item.expired);
                if (!artifact) continue;
                const bytes = await request(
                    'downloading the report artifact',
                    `${actions}/artifacts/${artifact.id}/zip`,
                    await installationToken(),
                    {},
                    async (response) => {
                        if (Number(response.headers.get('content-length')) > MAX_DOWNLOAD_BYTES) {
                            throw new GitHubError('The GitHub report artifact is too large');
                        }
                        const body = new Uint8Array(await response.arrayBuffer());
                        if (body.byteLength > MAX_DOWNLOAD_BYTES) throw new GitHubError('The GitHub report artifact is too large');
                        return body;
                    },
                );
                return { runId: run.id, raw: parseReportFile(bytes) };
            }
            return null;
        },

        async listOpenRenovatePrs() {
            const prs: RenovatePr[] = [];
            const cursors = new Set<string>();
            const heads: string[] = [];
            let after: string | null = null;
            for (;;) {
                const response: SearchResponse = await request<SearchResponse>(
                    'pull request search',
                    '/graphql',
                    await installationToken(),
                    { method: 'POST', body: JSON.stringify({ query: SEARCH, variables: { query: PR_QUERY, after } }) },
                );
                if (response.errors && response.errors.length > 0) {
                    const denied = response.errors.some(
                        (item) => item.type === 'FORBIDDEN' || /not accessible by integration/i.test(item.message ?? ''),
                    );
                    throw new GitHubError(
                        denied
                            ? 'GitHub denied the pull request search. The GitHub App is missing read permissions'
                            : 'GitHub pull request search returned errors',
                    );
                }
                const search = response.data?.search;
                if (!search || !Array.isArray(search.nodes) || typeof search.issueCount !== 'number') {
                    throw new GitHubError('GitHub pull request search returned incomplete data');
                }
                if (search.issueCount > MAX_SEARCH_RESULTS) {
                    throw new GitHubError(`GitHub pull request search matched more than ${MAX_SEARCH_RESULTS} results`);
                }
                for (const node of search.nodes) {
                    if (!node?.number || !node.repository || !node.headRefOid || !/^[A-Za-z0-9]+$/.test(node.headRefOid)) {
                        throw new GitHubError('GitHub pull request search returned incomplete data');
                    }
                    heads.push(node.headRefOid);
                    prs.push({
                        repo: node.repository.nameWithOwner,
                        number: node.number,
                        title: node.title,
                        url: node.url,
                        branch: node.headRefName,
                        createdAt: node.createdAt,
                        body: node.body ?? null,
                        checks: 'none',
                        labels: (node.labels?.nodes ?? []).map((label) => label.name),
                    });
                }
                const { hasNextPage, endCursor } = search.pageInfo;
                if (!hasNextPage) {
                    if (prs.length !== search.issueCount) {
                        throw new GitHubError('GitHub pull request search returned incomplete data');
                    }
                    await mapLimited(prs, CHECK_CONCURRENCY, async (pr, index) => {
                        pr.checks = await fetchChecks(pr.repo, heads[index]);
                    });
                    return prs;
                }
                if (!endCursor || cursors.has(endCursor)) {
                    throw new GitHubError('GitHub pull request search returned a missing or repeated page cursor');
                }
                cursors.add(endCursor);
                after = endCursor;
            }
        },
    };
}
