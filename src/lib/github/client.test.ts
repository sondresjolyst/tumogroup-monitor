import type { Server } from 'node:http';
import { strToU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient, deriveChecks, normalizePrivateKey, redact } from './client';
import { fakeAppId, fakeKey, fakePrNode, fakeRun, fakeToken, newFakeState, startFakeGitHub, type FakeState } from './fake-github';

let state: FakeState;
let server: Server;
let url: string;

beforeEach(async () => {
    state = newFakeState();
    ({ server, url } = await startFakeGitHub(state));
});

afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
});

const client = (timeout = '2000') =>
    createClient({ GITHUB_APP_ID: fakeAppId, GITHUB_PRIVATE_KEY: fakeKey, GITHUB_API_URL: url, GITHUB_TIMEOUT_MS: timeout });

describe('listRuns', () => {
    it('maps workflow runs', async () => {
        state.runs = [fakeRun(7, [])];
        expect(await client().listRuns()).toEqual([
            {
                id: 7,
                event: 'schedule',
                startedAt: '2026-11-01T02:00:00Z',
                updatedAt: '2026-11-01T02:20:00Z',
                conclusion: 'success',
            },
        ]);
    });

    it('times out instead of waiting for a stuck call', async () => {
        state.hang = true;
        const error = await client('100').listRuns().catch((caught: Error) => caught);
        expect((error as Error).message).toMatch(/timed out/);
    });
});

describe('downloadLatestReport', () => {
    it('uses the previous real report when the newest run has only a dry-run artifact', async () => {
        state.runs = [
            fakeRun(3, [{ id: 30, name: 'renovate-report-dry-run', expired: false, report: { dry: true } }]),
            fakeRun(2, [{ id: 20, name: 'renovate-report', expired: false, report: { real: 2 } }]),
            fakeRun(1, [{ id: 10, name: 'renovate-report', expired: false, report: { real: 1 } }]),
        ];
        expect(await client().downloadLatestReport()).toEqual({ runId: 2, raw: { real: 2 } });
    });

    it('skips expired artifacts and runs that are not completed', async () => {
        state.runs = [
            fakeRun(4, [{ id: 40, name: 'renovate-report', expired: false, report: { x: 4 } }], { status: 'in_progress' }),
            fakeRun(3, [{ id: 30, name: 'renovate-report', expired: true, report: { x: 3 } }]),
            fakeRun(2, [{ id: 20, name: 'renovate-report', expired: false, report: { x: 2 } }]),
        ];
        expect(await client().downloadLatestReport()).toEqual({ runId: 2, raw: { x: 2 } });
    });

    it('returns null when no run has a report artifact', async () => {
        state.runs = [fakeRun(1, [{ id: 10, name: 'renovate-report-dry-run', expired: false }])];
        expect(await client().downloadLatestReport()).toBeNull();
    });
});

describe('downloadLatestReport sources and size', () => {
    const real = { id: 20, name: 'renovate-report', expired: false, report: { ok: true } };

    it('skips branch runs, fork runs and failed runs', async () => {
        const art = (id: number) => [{ id, name: 'renovate-report', expired: false, report: { id } }];
        state.runs = [
            fakeRun(5, art(50), { head_branch: 'feature' }),
            fakeRun(4, art(40), { head_repository: { full_name: 'someone-else/si-renovate-config' } }),
            fakeRun(3, art(30), { conclusion: 'failure' }),
            fakeRun(2, [real]),
        ];
        expect(await client().downloadLatestReport()).toEqual({ runId: 2, raw: { ok: true } });
    });

    it('rejects a download over 20 MB by Content-Length', async () => {
        const zipBytes = new Uint8Array(21 * 1024 * 1024);
        state.runs = [fakeRun(1, [{ ...real, zipBytes }])];
        await expect(client().downloadLatestReport()).rejects.toThrow(/too large/);
    });

    it('rejects a download over 20 MB by actual length when there is no Content-Length', async () => {
        const zipBytes = new Uint8Array(21 * 1024 * 1024);
        state.runs = [fakeRun(1, [{ ...real, zipBytes, chunked: true }])];
        await expect(client().downloadLatestReport()).rejects.toThrow(/too large/);
    });

    it('fails by name when report.json is missing and does not use another file', async () => {
        state.runs = [fakeRun(1, [{ ...real, files: { 'other.json': strToU8('{"a":1}') } }])];
        await expect(client().downloadLatestReport()).rejects.toThrow(/no report\.json/);
    });

    it('rejects a report.json that inflates past 100 MB without inflating it', async () => {
        const files = { 'report.json': new Uint8Array(101 * 1024 * 1024) };
        state.runs = [fakeRun(1, [{ ...real, files }])];
        await expect(client().downloadLatestReport()).rejects.toThrow(/too large/);
    });
});

describe('listOpenRenovatePrs partial data', () => {
    const fails = async (pattern: RegExp) => {
        const error = await client().listOpenRenovatePrs().catch((caught: Error) => caught);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(pattern);
    };

    it('fails when GraphQL returns errors', async () => {
        state.graphqlErrors = [{ message: 'secret detail ' + fakeToken }];
        await fails(/returned errors/);
    });

    it('fails with a plain message on a permission error', async () => {
        state.graphqlErrors = [{ type: 'FORBIDDEN', message: 'Resource not accessible by integration' }];
        await fails(/denied.*permissions/);
    });

    it('fails when search is null', async () => {
        state.graphqlSearchNull = true;
        await fails(/incomplete/);
    });

    it('fails when a node is null', async () => {
        state.prPages = [[fakePrNode(1), null]];
        state.issueCountOverride = 2;
        await fails(/incomplete/);
    });

    it('fails when the head commit is missing', async () => {
        state.prPages = [[fakePrNode(1, { headRefOid: null })]];
        await fails(/incomplete/);
    });

    it('fails when there is a next page and no cursor', async () => {
        state.prPages = [[fakePrNode(1)], [fakePrNode(2)]];
        state.cursorOverride = null;
        await fails(/cursor/);
    });

    it('fails when the cursor repeats', async () => {
        state.prPages = [[fakePrNode(1)], [fakePrNode(2)]];
        state.cursorOverride = '0';
        await fails(/cursor/);
    });

    it('fails when the issue count is over 1000', async () => {
        state.prPages = [[fakePrNode(1)]];
        state.issueCountOverride = 1001;
        await fails(/more than 1000/);
    });

    it('fails when the final count differs from the issue count', async () => {
        state.prPages = [[fakePrNode(1)]];
        state.issueCountOverride = 3;
        await fails(/incomplete/);
    });
});

describe('listOpenRenovatePrs', () => {
    const runs = (...conclusions: Array<string | null>) =>
        conclusions.map((conclusion) => ({ status: conclusion === null ? 'in_progress' : 'completed', conclusion }));
    const noStatus = { state: 'pending', total_count: 0 };

    it('follows pagination and takes checks from the REST API', async () => {
        state.prPages = [
            [fakePrNode(1), fakePrNode(2), fakePrNode(3)],
            [fakePrNode(4), fakePrNode(5)],
            [fakePrNode(6, { body: null })],
        ];
        state.checks = {
            sha1: { runs: runs('success', 'failure'), status: noStatus },
            sha2: { runs: [], status: { state: 'error', total_count: 1 } },
            sha3: { runs: runs('success', null), status: noStatus },
            sha4: { runs: [], status: { state: 'pending', total_count: 2 } },
            sha5: { runs: runs('success', 'neutral', 'skipped'), status: { state: 'success', total_count: 1 } },
        };
        const prs = await client().listOpenRenovatePrs();
        expect(prs.map((pr) => [pr.number, pr.checks])).toEqual([
            [1, 'failing'],
            [2, 'failing'],
            [3, 'pending'],
            [4, 'pending'],
            [5, 'passing'],
            [6, 'none'],
        ]);
        expect(prs[0]).toMatchObject({
            repo: 'example-org/app-one',
            branch: 'renovate/thing-1',
            labels: ['dependencies'],
            body: 'body text',
        });
        expect(prs[5].body).toBeNull();
        expect(state.requests.filter((request) => request === 'POST /graphql')).toHaveLength(3);
    });

    it('never asks GraphQL for commit data, which private repositories refuse', async () => {
        state.prPages = [[fakePrNode(1)]];
        await expect(client().listOpenRenovatePrs()).resolves.toHaveLength(1);
    });

    it('follows check run pagination', async () => {
        state.prPages = [[fakePrNode(1)]];
        state.checkPageSize = 2;
        state.checks = { sha1: { runs: runs('success', 'success', 'success', 'timed_out'), status: noStatus } };
        expect((await client().listOpenRenovatePrs())[0].checks).toBe('failing');
        expect(state.requests.filter((request) => request.endsWith('/check-runs')).length).toBeGreaterThanOrEqual(2);
    });

    it.each(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'])('treats a %s check run as failing', async (conclusion) => {
        state.prPages = [[fakePrNode(1)]];
        state.checks = { sha1: { runs: runs('success', conclusion), status: noStatus } };
        expect((await client().listOpenRenovatePrs())[0].checks).toBe('failing');
    });

    it('limits concurrent check requests', async () => {
        state.prPages = [Array.from({ length: 20 }, (_, index) => fakePrNode(index + 1))];
        state.checkDelayMs = 20;
        await client().listOpenRenovatePrs();
        expect(state.maxInflight).toBeGreaterThan(1);
        expect(state.maxInflight).toBeLessThanOrEqual(5);
    });

    it('throws on a non 2xx check response without the body', async () => {
        state.prPages = [[fakePrNode(1)]];
        state.checksStatus = 500;
        const error = await client().listOpenRenovatePrs().catch((caught: Error) => caught);
        expect((error as Error).message).toMatch(/check/);
        expect((error as Error).message).toMatch(/500/);
        expect((error as Error).message).not.toContain('boom');
    });

    it('throws an error without the response body or token on a 500', async () => {
        state.graphqlStatus = 500;
        const error = await client().listOpenRenovatePrs().catch((caught: Error) => caught);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/pull request search/);
        expect((error as Error).message).toMatch(/500/);
        expect((error as Error).message).not.toContain('boom');
        expect((error as Error).message).not.toContain(fakeToken);
    });
});

describe('auth', () => {
    it('accepts a key with literal backslash n sequences', async () => {
        const escaped = fakeKey.replace(/\n/g, '\\n');
        expect(normalizePrivateKey(escaped)).toBe(fakeKey);
        state.runs = [fakeRun(7, [])];
        const escapedClient = createClient({ GITHUB_APP_ID: fakeAppId, GITHUB_PRIVATE_KEY: escaped, GITHUB_API_URL: url });
        expect(await escapedClient.listRuns()).toHaveLength(1);
    });

    it('fails with a safe message when a variable is missing', () => {
        expect(() => createClient({ GITHUB_APP_ID: '', GITHUB_PRIVATE_KEY: fakeKey })).toThrow(/GITHUB_APP_ID/);
    });

    it('does not leak the key when it cannot be parsed', async () => {
        const bad = createClient({ GITHUB_APP_ID: '1', GITHUB_PRIVATE_KEY: 'not-a-key-SECRET', GITHUB_API_URL: url });
        const error = await bad.listRuns().catch((caught: Error) => caught);
        expect((error as Error).message).not.toContain('SECRET');
    });
});

describe('redact', () => {
    it('removes tokens and key material', () => {
        const text = `postgres://app:hunter2@db.example:5432/x https://u:p@ss@host/path a ${fakeToken} b ${fakeKey} c ghp_abcdefghijklmnopqrstuvwxyz0123 d github_pat_11AAAA_bbbbCCCC`;
        const result = redact(text);
        expect(result).not.toContain('ghs_');
        expect(result).not.toContain('ghp_');
        expect(result).not.toContain('github_pat_');
        expect(result).not.toContain('BEGIN');
        expect(result).not.toContain('MII');
        expect(result).not.toContain('hunter2');
        expect(result).not.toContain('p@ss');
    });
});

describe('deriveChecks', () => {
    it('is none with no runs and an empty status, whatever its state says', () => {
        expect(deriveChecks([], { state: 'pending', total_count: 0 })).toBe('none');
    });
    it('is pending for a pending status with contexts', () => {
        expect(deriveChecks([], { state: 'pending', total_count: 1 })).toBe('pending');
    });
    it('is passing for neutral and skipped runs', () => {
        expect(deriveChecks([{ status: 'completed', conclusion: 'neutral' }, { status: 'completed', conclusion: 'skipped' }], { state: 'pending', total_count: 0 })).toBe('passing');
    });
    it('is failing before pending', () => {
        expect(deriveChecks([{ status: 'queued', conclusion: null }, { status: 'completed', conclusion: 'failure' }], { state: 'success', total_count: 1 })).toBe('failing');
    });
});
