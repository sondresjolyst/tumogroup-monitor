import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const fakeKey = pair.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const publicKey = pair.publicKey;
export const fakeAppId = '123';

export const fakeToken = 'ghs_FakeInstallationToken0123456789abcdef';

export interface FakeArtifact {
    id: number;
    name: string;
    expired: boolean;
    report?: unknown;
    /** Zip entries by name, used instead of report. */
    files?: Record<string, Uint8Array>;
    /** A zip body sent as is. */
    zipBytes?: Uint8Array;
    /** Send the zip without a Content-Length header. */
    chunked?: boolean;
}

export interface FakeRun {
    id: number;
    event: string;
    status: string;
    conclusion: string | null;
    created_at: string;
    run_started_at: string;
    updated_at: string;
    head_branch: string;
    head_repository: { full_name: string };
    artifacts: FakeArtifact[];
}

export interface FakeChecks {
    runs: Array<{ status: string; conclusion: string | null }>;
    status: { state: string; total_count: number };
}

export interface FakeState {
    /** Check data by head sha. A sha without an entry has no checks. */
    checks: Record<string, FakeChecks>;
    checkPageSize: number;
    checkDelayMs: number;
    checksStatus: number;
    inflight: number;
    maxInflight: number;
    runs: FakeRun[];
    prPages: unknown[][];
    graphqlStatus: number;
    graphqlErrors: unknown[] | null;
    graphqlSearchNull: boolean;
    cursorOverride: string | null | undefined;
    issueCountOverride: number | null;
    hang: boolean;
    requests: string[];
}

export function newFakeState(): FakeState {
    return { checks: {}, checkPageSize: 100, checkDelayMs: 0, checksStatus: 200, inflight: 0, maxInflight: 0, runs: [], prPages: [[]], graphqlStatus: 200, graphqlErrors: null, graphqlSearchNull: false, cursorOverride: undefined, issueCountOverride: null, hang: false, requests: [] };
}

export function fakeRun(id: number, artifacts: FakeArtifact[], overrides: Partial<FakeRun> = {}): FakeRun {
    return {
        id,
        event: 'schedule',
        status: 'completed',
        conclusion: 'success',
        created_at: '2026-11-01T02:00:00Z',
        run_started_at: '2026-11-01T02:00:00Z',
        updated_at: '2026-11-01T02:20:00Z',
        head_branch: 'main',
        head_repository: { full_name: 'sondresjolyst/si-renovate-config' },
        artifacts,
        ...overrides,
    };
}

export function fakePrNode(number: number, extra: Record<string, unknown> = {}) {
    return {
        number,
        title: `chore(deps): update dependency thing-${number}`,
        url: `https://github.com/example-org/app-one/pull/${number}`,
        headRefName: `renovate/thing-${number}`,
        headRefOid: `sha${number}`,
        createdAt: '2026-10-30T06:00:00Z',
        body: 'body text',
        repository: { nameWithOwner: 'example-org/app-one' },
        labels: { nodes: [{ name: 'dependencies' }] },
        ...extra,
    };
}

const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => resolve(data));
    });

function authorized(req: IncomingMessage, pathname: string): boolean {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) return false;
    const bearer = header.slice('Bearer '.length);
    if (!pathname.startsWith('/app/')) return bearer === fakeToken;
    const [head, claims, signature] = bearer.split('.');
    if (!head || !claims || !signature) return false;
    const verifier = createVerify('RSA-SHA256').update(`${head}.${claims}`);
    if (!verifier.verify(publicKey, Buffer.from(signature, 'base64url'))) return false;
    const payload = JSON.parse(Buffer.from(claims, 'base64url').toString()) as { iss: string; exp: number };
    return payload.iss === fakeAppId && payload.exp > Date.now() / 1000;
}

const repoPath = '/repos/sondresjolyst/si-renovate-config/actions';

export async function startFakeGitHub(state: FakeState): Promise<{ url: string; server: Server }> {
    const server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        state.requests.push(`${req.method} ${url.pathname}`);
        if (state.hang) return;
        const isBlob = url.pathname.startsWith('/blob/');
        if (!isBlob && !authorized(req, url.pathname)) return json(res, 401, { message: 'Bad credentials' });
        const allArtifacts = state.runs.flatMap((run) => run.artifacts);
        if (url.pathname === '/app/installations') {
            return json(res, 200, [
                { id: 1, account: { login: 'someone-else' } },
                { id: 42, account: { login: 'sondresjolyst' } },
            ]);
        }
        if (url.pathname === '/app/installations/42/access_tokens' && req.method === 'POST') {
            return json(res, 201, { token: fakeToken });
        }
        if (url.pathname === `${repoPath}/workflows/renovate.yml/runs`) {
            return json(res, 200, {
                workflow_runs: state.runs.map((run) => ({ ...run, artifacts: undefined })),
            });
        }
        const artifactList = url.pathname.match(new RegExp(`^${repoPath}/runs/(\\d+)/artifacts$`));
        if (artifactList) {
            const run = state.runs.find((candidate) => candidate.id === Number(artifactList[1]));
            return json(res, 200, {
                artifacts: (run?.artifacts ?? []).map((artifact) => ({
                    id: artifact.id,
                    name: artifact.name,
                    expired: artifact.expired,
                })),
            });
        }
        const artifactZip = url.pathname.match(new RegExp(`^${repoPath}/artifacts/(\\d+)/zip$`));
        if (artifactZip) {
            res.writeHead(302, { location: `http://${req.headers.host}/blob/${artifactZip[1]}` });
            return res.end();
        }
        const blob = url.pathname.match(/^\/blob\/(\d+)$/);
        if (blob) {
            const artifact = allArtifacts.find((candidate) => candidate.id === Number(blob[1]));
            const zip =
                artifact?.zipBytes ??
                zipSync(artifact?.files ?? { 'report.json': strToU8(JSON.stringify(artifact?.report ?? {})) });
            res.writeHead(200, { 'content-type': 'application/zip' });
            if (artifact?.chunked) {
                res.write(Buffer.from(zip));
                return res.end();
            }
            return res.end(Buffer.from(zip));
        }
        const checkRoute = url.pathname.match(/^\/repos\/example-org\/app-one\/commits\/([^/]+)\/(check-runs|status)$/);
        if (checkRoute) {
            state.inflight++;
            state.maxInflight = Math.max(state.maxInflight, state.inflight);
            await new Promise((resolve) => setTimeout(resolve, state.checkDelayMs));
            state.inflight--;
            if (state.checksStatus !== 200) return json(res, state.checksStatus, { message: `boom ${fakeToken}` });
            const checks = state.checks[checkRoute[1]] ?? { runs: [], status: { state: 'pending', total_count: 0 } };
            if (checkRoute[2] === 'status') return json(res, 200, checks.status);
            const page = Number(url.searchParams.get('page') ?? '1');
            const slice = checks.runs.slice((page - 1) * state.checkPageSize, page * state.checkPageSize);
            return json(res, 200, { total_count: checks.runs.length, check_runs: slice });
        }
        if (url.pathname === '/graphql') {
            const body = JSON.parse(await readBody(req)) as { query: string; variables: { after: string | null } };
            // The real app has no Contents read, so commit data is refused for private repositories.
            if (/commits|statusCheckRollup/.test(body.query)) {
                return json(res, 200, {
                    data: null,
                    errors: [{ type: 'FORBIDDEN', message: 'Resource not accessible by integration' }],
                });
            }
            if (state.graphqlStatus !== 200) {
                res.writeHead(state.graphqlStatus, { 'content-type': 'text/plain' });
                return res.end(`boom ${fakeToken}`);
            }
            if (state.graphqlErrors) return json(res, 200, { data: null, errors: state.graphqlErrors });
            if (state.graphqlSearchNull) return json(res, 200, { data: { search: null } });
            const index = body.variables.after === null ? 0 : Number(body.variables.after);
            const nodes = state.prPages[index] ?? [];
            const more = index + 1 < state.prPages.length;
            const cursor = state.cursorOverride !== undefined ? state.cursorOverride : more ? String(index + 1) : null;
            return json(res, 200, {
                data: {
                    search: {
                        issueCount: state.issueCountOverride ?? state.prPages.reduce((sum, page) => sum + page.length, 0),
                        nodes,
                        pageInfo: { hasNextPage: more, endCursor: cursor },
                    },
                },
            });
        }
        json(res, 404, { message: 'not found' });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
