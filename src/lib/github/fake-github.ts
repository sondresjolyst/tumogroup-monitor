import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';

export const fakeKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();

export const fakeToken = 'ghs_FakeInstallationToken0123456789abcdef';

export interface FakeArtifact {
    id: number;
    name: string;
    expired: boolean;
    report?: unknown;
}

export interface FakeRun {
    id: number;
    event: string;
    status: string;
    conclusion: string | null;
    created_at: string;
    run_started_at: string;
    updated_at: string;
    artifacts: FakeArtifact[];
}

export interface FakeState {
    runs: FakeRun[];
    prPages: unknown[][];
    graphqlStatus: number;
    hang: boolean;
    requests: string[];
}

export function newFakeState(): FakeState {
    return { runs: [], prPages: [[]], graphqlStatus: 200, hang: false, requests: [] };
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
        artifacts,
        ...overrides,
    };
}

export function fakePrNode(number: number, state: string | null, extra: Record<string, unknown> = {}) {
    return {
        number,
        title: `chore(deps): update dependency thing-${number}`,
        url: `https://github.com/example-org/app-one/pull/${number}`,
        headRefName: `renovate/thing-${number}`,
        createdAt: '2026-10-30T06:00:00Z',
        body: 'body text',
        repository: { nameWithOwner: 'example-org/app-one' },
        labels: { nodes: [{ name: 'dependencies' }] },
        commits: { nodes: [{ commit: { statusCheckRollup: state === null ? null : { state } } }] },
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

const repoPath = '/repos/sondresjolyst/si-renovate-config/actions';

export async function startFakeGitHub(state: FakeState): Promise<{ url: string; server: Server }> {
    const server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        state.requests.push(`${req.method} ${url.pathname}`);
        if (state.hang) return;
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
            return json(res, 200, { workflow_runs: state.runs });
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
            const zip = zipSync({ 'report.json': strToU8(JSON.stringify(artifact?.report ?? {})) });
            res.writeHead(200, { 'content-type': 'application/zip' });
            return res.end(Buffer.from(zip));
        }
        if (url.pathname === '/graphql') {
            const body = JSON.parse(await readBody(req)) as { variables: { after: string | null } };
            if (state.graphqlStatus !== 200) {
                res.writeHead(state.graphqlStatus, { 'content-type': 'text/plain' });
                return res.end(`boom ${fakeToken}`);
            }
            const index = body.variables.after === null ? 0 : Number(body.variables.after);
            const nodes = state.prPages[index] ?? [];
            const more = index + 1 < state.prPages.length;
            return json(res, 200, {
                data: { search: { nodes, pageInfo: { hasNextPage: more, endCursor: more ? String(index + 1) : null } } },
            });
        }
        json(res, 404, { message: 'not found' });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}
