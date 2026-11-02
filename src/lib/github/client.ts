import { createSign } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import type { ChecksState, RenovatePr, WorkflowRun } from '@/lib/model/types';

const OWNER = 'sondresjolyst';
const CONFIG_REPO = 'si-renovate-config';
const WORKFLOW_FILE = 'renovate.yml';
const REPORT_ARTIFACT = 'renovate-report';
const PR_QUERY = `is:pr is:open author:app/sjolyst-innovation-renovate user:${OWNER}`;
const DEFAULT_API_URL = 'https://api.github.com';
const DEFAULT_TIMEOUT_MS = 30_000;

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

const KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{5,})/g;
const BASE64_LONG = /[A-Za-z0-9+/=]{40,}/g;

/** Defence in depth. Messages should already be free of secrets. */
export function redact(text: string): string {
    return text
        .replace(/\\n/g, '\n')
        .replace(KEY_BLOCK, '[redacted key]')
        .replace(TOKEN, '[redacted token]')
        .replace(BASE64_LONG, '[redacted]');
}

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

const checksStates: Record<string, ChecksState> = {
    FAILURE: 'failing',
    ERROR: 'failing',
    PENDING: 'pending',
    EXPECTED: 'pending',
    SUCCESS: 'passing',
};

interface PrNode {
    number: number;
    title: string;
    url: string;
    headRefName: string;
    createdAt: string;
    body: string | null;
    repository: { nameWithOwner: string };
    labels: { nodes: Array<{ name: string }> } | null;
    commits: { nodes: Array<{ commit: { statusCheckRollup: { state: string } | null } }> } | null;
}

interface SearchResponse {
    data?: { search: { nodes: Array<PrNode | null>; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
    errors?: unknown;
}

const SEARCH = `query($query: String!, $after: String) {
  search(query: $query, type: ISSUE, first: 50, after: $after) {
    nodes {
      ... on PullRequest {
        number title url headRefName createdAt body
        repository { nameWithOwner }
        labels(first: 20) { nodes { name } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
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
        run_started_at?: string | null;
        updated_at: string;
    }>;
}

interface ArtifactsResponse {
    artifacts: Array<{ id: number; name: string; expired: boolean }>;
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
            const runs = (await fetchRuns()).filter((run) => run.status === 'completed');
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
                    async (response) => new Uint8Array(await response.arrayBuffer()),
                );
                try {
                    const files = unzipSync(bytes);
                    const names = Object.keys(files);
                    const name = names.find((item) => item.endsWith('.json')) ?? names[0];
                    return { runId: run.id, raw: JSON.parse(strFromU8(files[name])) as unknown };
                } catch {
                    throw new GitHubError('The GitHub report artifact could not be unpacked');
                }
            }
            return null;
        },

        async listOpenRenovatePrs() {
            const prs: RenovatePr[] = [];
            let after: string | null = null;
            for (;;) {
                const response: SearchResponse = await request<SearchResponse>(
                    'pull request search',
                    '/graphql',
                    await installationToken(),
                    { method: 'POST', body: JSON.stringify({ query: SEARCH, variables: { query: PR_QUERY, after } }) },
                );
                if (!response.data) throw new GitHubError('GitHub pull request search returned an error');
                const { nodes, pageInfo } = response.data.search;
                for (const node of nodes) {
                    if (!node?.number) continue;
                    const state = node.commits?.nodes[0]?.commit.statusCheckRollup?.state;
                    prs.push({
                        repo: node.repository.nameWithOwner,
                        number: node.number,
                        title: node.title,
                        url: node.url,
                        branch: node.headRefName,
                        createdAt: node.createdAt,
                        body: node.body ?? null,
                        checks: (state ? checksStates[state] : undefined) ?? 'none',
                        labels: (node.labels?.nodes ?? []).map((label) => label.name),
                    });
                }
                if (!pageInfo.hasNextPage || !pageInfo.endCursor) return prs;
                after = pageInfo.endCursor;
            }
        },
    };
}
