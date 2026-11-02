import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubError, type GitHubClient } from '@/lib/github/client';
import { fakeKey, fakeToken } from '@/lib/github/fake-github';
import type { PageModel, RenovatePr, WorkflowRun } from '@/lib/model/types';
import { refresh, runJob, type RefreshDeps } from './refresh';

const report = JSON.parse(readFileSync(new URL('../lib/model/fixtures/report.json', import.meta.url), 'utf8'));
const now = new Date('2026-11-02T10:00:00Z');

const runs: WorkflowRun[] = [
    { id: 5, event: 'schedule', startedAt: '2026-11-01T02:00:00Z', updatedAt: '2026-11-01T02:20:00Z', conclusion: 'success' },
];

const oldModel = { counts: { needsApproval: 99 } } as unknown as PageModel;

let saved: { model: PageModel | null; error: string | null; savedRuns: WorkflowRun[] };
let calls: string[];
let client: GitHubClient;
let deps: RefreshDeps;

beforeEach(() => {
    saved = { model: oldModel, error: null, savedRuns: [] };
    calls = [];
    client = {
        listRuns: vi.fn(async () => runs),
        downloadLatestReport: vi.fn(async () => ({ runId: 5, raw: report as unknown })),
        listOpenRenovatePrs: vi.fn(async (): Promise<RenovatePr[]> => []),
    };
    deps = {
        client,
        store: {
            applySchema: vi.fn(async () => void calls.push('applySchema')),
            upsertRuns: vi.fn(async (list: WorkflowRun[]) => {
                calls.push('upsertRuns');
                saved.savedRuns = list;
            }),
            readRuns: vi.fn(async () => {
                calls.push('readRuns');
                return saved.savedRuns;
            }),
            saveSuccess: vi.fn(async (model: PageModel) => {
                calls.push('saveSuccess');
                saved.model = model;
                saved.error = null;
            }),
            saveFailure: vi.fn(async (message: string) => {
                calls.push('saveFailure');
                saved.error = message;
            }),
        },
        log: vi.fn(),
    };
});

describe('refresh', () => {
    it('saves schema, runs, then a model built from stored runs', async () => {
        await refresh(deps, now);
        expect(calls).toEqual(['applySchema', 'upsertRuns', 'readRuns', 'saveSuccess']);
        expect(deps.store.readRuns).toHaveBeenCalledWith(expect.any(Number));
        expect(vi.mocked(deps.store.readRuns).mock.calls[0][0]).toBeGreaterThanOrEqual(90);
        expect(deps.store.saveSuccess).toHaveBeenCalledWith(expect.anything(), 5, now);
        expect(saved.model).not.toBe(oldModel);
    });

    it('malformed report calls saveFailure with the failing path and keeps the old model', async () => {
        client.downloadLatestReport = vi.fn(async () => ({ runId: 5, raw: { problems: [], repositories: { 'a/b': { status: 3 } } } }));
        await expect(refresh(deps, now)).rejects.toThrow();
        expect(saved.error).toContain('repositories.a/b.status');
        expect(saved.model).toBe(oldModel);
        expect(deps.store.saveSuccess).not.toHaveBeenCalled();
    });

    it('no report artifact at all calls saveFailure', async () => {
        client.downloadLatestReport = vi.fn(async () => null);
        await expect(refresh(deps, now)).rejects.toThrow();
        expect(saved.error).toMatch(/No Renovate report/);
        expect(saved.model).toBe(oldModel);
    });

    it('GitHub 500 on PR search calls saveFailure and leaves the model unchanged', async () => {
        client.listOpenRenovatePrs = vi.fn(async () => {
            throw new GitHubError('GitHub pull request search failed with status 500');
        });
        await expect(refresh(deps, now)).rejects.toThrow();
        expect(saved.error).toBe('GitHub pull request search failed with status 500.');
        expect(saved.model).toBe(oldModel);
    });

    it('run history is saved even when the report fails', async () => {
        client.downloadLatestReport = vi.fn(async () => null);
        await expect(refresh(deps, now)).rejects.toThrow();
        expect(saved.savedRuns).toEqual(runs);
        expect(calls.indexOf('upsertRuns')).toBeLessThan(calls.indexOf('saveFailure'));
    });

    it('error messages and logs never contain the private key or a token', async () => {
        client.listOpenRenovatePrs = vi.fn(async () => {
            throw new Error(`failed with ${fakeToken} and ${fakeKey} and ${fakeKey.replace(/\n/g, '\\n')}`);
        });
        await expect(refresh(deps, now)).rejects.toThrow();
        const logged = JSON.stringify(vi.mocked(deps.log!).mock.calls);
        for (const text of [saved.error ?? '', logged]) {
            expect(text).not.toContain('ghs_');
            expect(text).not.toContain('BEGIN');
            expect(text).not.toContain('MII');
        }
        expect(saved.error).not.toBe('');
    });
});

describe('runJob', () => {
    it('returns 0 on success and 1 on failure', async () => {
        expect(await runJob(deps, now)).toBe(0);
        client.downloadLatestReport = vi.fn(async () => null);
        expect(await runJob(deps, now)).toBe(1);
    });

    it('returns 1 when saving the failure also fails', async () => {
        client.downloadLatestReport = vi.fn(async () => null);
        deps.store.saveFailure = vi.fn(async () => {
            throw new Error('db down');
        });
        expect(await runJob(deps, now)).toBe(1);
    });
});
