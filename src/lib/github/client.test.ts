import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient, normalizePrivateKey, redact } from './client';
import { fakeKey, fakePrNode, fakeRun, fakeToken, newFakeState, startFakeGitHub, type FakeState } from './fake-github';

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
    createClient({ GITHUB_APP_ID: '123', GITHUB_PRIVATE_KEY: fakeKey, GITHUB_API_URL: url, GITHUB_TIMEOUT_MS: timeout });

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

describe('listOpenRenovatePrs', () => {
    it('follows pagination and maps check states', async () => {
        state.prPages = [
            [fakePrNode(1, 'FAILURE'), fakePrNode(2, 'ERROR'), fakePrNode(3, 'PENDING')],
            [fakePrNode(4, 'EXPECTED'), fakePrNode(5, 'SUCCESS')],
            [fakePrNode(6, null, { body: null })],
        ];
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
        const escapedClient = createClient({ GITHUB_APP_ID: '123', GITHUB_PRIVATE_KEY: escaped, GITHUB_API_URL: url });
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
        const text = `a ${fakeToken} b ${fakeKey} c ghp_abcdefghijklmnopqrstuvwxyz0123 d github_pat_11AAAA_bbbbCCCC`;
        const result = redact(text);
        expect(result).not.toContain('ghs_');
        expect(result).not.toContain('ghp_');
        expect(result).not.toContain('github_pat_');
        expect(result).not.toContain('BEGIN');
        expect(result).not.toContain('MII');
    });
});
