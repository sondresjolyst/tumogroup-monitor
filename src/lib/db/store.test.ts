import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MODEL_VERSION, type PageModel, type WorkflowRun } from '@/lib/model/types';
import { schemaSql } from './schema';
import { applySchema, readLatest, readPageState, readRuns, saveFailure, saveSuccess, upsertRuns } from './store';

if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Run these tests with npm run test:db.');
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const pageRole = 'tumogroup_monitor_readonly';

const model: PageModel = {
    modelVersion: MODEL_VERSION,
    counts: { needsApproval: 1, cooldown: 2, waiting: 3, otherPrs: 4, noReleaseDate: 5, problems: 6 },
    needsApproval: [],
    cooldown: [],
    waiting: [],
    otherPrs: [],
    problems: [],
    warnings: [],
};

const run = (id: number, startedAt: string, conclusion: string | null = 'success'): WorkflowRun => ({
    id,
    event: 'schedule',
    headBranch: 'main',
    startedAt,
    updatedAt: startedAt,
    conclusion,
});

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

beforeAll(async () => {
    await pool.query(
        `DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${pageRole}') THEN CREATE ROLE ${pageRole}; END IF;
        END $$`,
    );
    // The bootstrap script does this in production. The schema itself names no role.
    await pool.query(`ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO ${pageRole}`);
});

beforeEach(async () => {
    await pool.query('DROP TABLE IF EXISTS current_state, runs');
    await applySchema(pool);
});

afterAll(async () => {
    await pool.end();
});

describe('applySchema', () => {
    it('can run twice without losing data', async () => {
        await saveSuccess(pool, model, 7, new Date('2026-11-01T10:00:00Z'));
        await applySchema(pool);
        expect((await readLatest(pool)).model).toEqual(model);
    });

    it('adds the branch column to an older runs table and keeps its rows', async () => {
        await pool.query('DROP TABLE runs');
        await pool.query(
            `CREATE TABLE runs (id bigint PRIMARY KEY, event text NOT NULL, started_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, conclusion text)`,
        );
        await pool.query(`INSERT INTO runs VALUES (1, 'schedule', now(), now(), 'success')`);
        await applySchema(pool);
        expect((await readRuns(pool, 10)).map((r) => [r.id, r.headBranch])).toEqual([[1, null]]);
        await upsertRuns(pool, [run(1, daysAgo(1))]);
        expect((await readRuns(pool, 10))[0].headBranch).toBe('main');
    });
});

describe('readLatest', () => {
    it('on an empty database returns nulls', async () => {
        expect(await readLatest(pool)).toEqual({
            model: null,
            modelOutdated: false,
            reportRunId: null,
            lastSuccessAt: null,
            lastError: null,
            lastErrorAt: null,
        });
    });

    it.each([
        ['no version', { counts: {} }],
        ['another version', { ...model, modelVersion: MODEL_VERSION + 1 }],
    ])('reads a stored model with %s as outdated, with no model', async (_name, stored) => {
        await saveSuccess(pool, stored as unknown as PageModel, 42, new Date('2026-11-01T10:00:00Z'));
        expect(await readLatest(pool)).toEqual({
            model: null,
            modelOutdated: true,
            reportRunId: 42,
            lastSuccessAt: new Date('2026-11-01T10:00:00Z'),
            lastError: null,
            lastErrorAt: null,
        });
    });
});

describe('readPageState', () => {
    it('returns the state and runs', async () => {
        await saveSuccess(pool, model, 42, new Date('2026-11-01T10:00:00Z'));
        await upsertRuns(pool, [run(1, daysAgo(1))]);
        const page = await readPageState(pool, 10);
        expect(page.state?.model).toEqual(model);
        expect(page.runs.map((r) => r.id)).toEqual([1]);
    });

    it('before the first refresh has made the tables, reads as an empty state, not a failure', async () => {
        await pool.query('DROP TABLE current_state, runs');
        expect(await readPageState(pool, 10)).toEqual({
            state: { model: null, modelOutdated: false, reportRunId: null, lastSuccessAt: null, lastError: null, lastErrorAt: null },
            runs: [],
        });
    });

    it('still throws on other database errors', async () => {
        const failing = { query: () => Promise.reject(Object.assign(new Error('denied'), { code: '42501' })) } as unknown as Pool;
        await expect(readPageState(failing, 10)).rejects.toThrow('denied');
    });

    it('reads runs from a table the new job has not migrated yet', async () => {
        await pool.query('ALTER TABLE runs DROP COLUMN head_branch');
        await pool.query(`INSERT INTO runs VALUES (1, 'schedule', now(), now(), 'success')`);
        expect((await readPageState(pool, 10)).runs.map((r) => [r.id, r.headBranch])).toEqual([[1, null]]);
    });
});

describe('saveSuccess', () => {
    it('stores the model and clears last_error', async () => {
        await saveFailure(pool, 'boom', new Date('2026-11-01T09:00:00Z'));
        await saveSuccess(pool, model, 42, new Date('2026-11-01T10:00:00Z'));
        expect(await readLatest(pool)).toEqual({
            model,
            modelOutdated: false,
            reportRunId: 42,
            lastSuccessAt: new Date('2026-11-01T10:00:00Z'),
            lastError: null,
            lastErrorAt: null,
        });
    });
});

describe('saveFailure', () => {
    it('on a fresh database sets the error and leaves the model null', async () => {
        await saveFailure(pool, 'boom', new Date('2026-11-01T11:00:00Z'));
        expect(await readLatest(pool)).toEqual({
            model: null,
            modelOutdated: false,
            reportRunId: null,
            lastSuccessAt: null,
            lastError: 'boom',
            lastErrorAt: new Date('2026-11-01T11:00:00Z'),
        });
    });

    it('still works if the seed row is missing', async () => {
        await pool.query('DELETE FROM current_state');
        await saveFailure(pool, 'boom', new Date('2026-11-01T11:00:00Z'));
        expect((await readLatest(pool)).lastError).toBe('boom');
    });

    it('keeps the last model', async () => {
        await saveSuccess(pool, model, 42, new Date('2026-11-01T10:00:00Z'));
        await saveFailure(pool, 'boom', new Date('2026-11-01T11:00:00Z'));
        expect(await readLatest(pool)).toEqual({
            model,
            modelOutdated: false,
            reportRunId: 42,
            lastSuccessAt: new Date('2026-11-01T10:00:00Z'),
            lastError: 'boom',
            lastErrorAt: new Date('2026-11-01T11:00:00Z'),
        });
    });
});

describe('upsertRuns', () => {
    it('updates a run in place', async () => {
        const started = daysAgo(1);
        await upsertRuns(pool, [run(1, started, null)]);
        await upsertRuns(pool, [run(1, started, 'failure'), run(2, started)]);
        const runs = await readRuns(pool, 10);
        expect(runs).toHaveLength(2);
        expect(runs.find((r) => r.id === 1)?.conclusion).toBe('failure');
    });

    it('stores the branch of a run, and null when it has none', async () => {
        const started = daysAgo(1);
        await upsertRuns(pool, [{ ...run(1, started), headBranch: 'example/test-branch' }, { ...run(2, started), headBranch: null }]);
        const runs = await readRuns(pool, 10);
        expect(runs.find((r) => r.id === 1)?.headBranch).toBe('example/test-branch');
        expect(runs.find((r) => r.id === 2)?.headBranch).toBeNull();
    });

    it('deletes runs older than 90 days', async () => {
        await upsertRuns(pool, [run(1, daysAgo(91)), run(2, daysAgo(89))]);
        expect((await readRuns(pool, 10)).map((r) => r.id)).toEqual([2]);
    });

    it('does nothing for an empty list', async () => {
        await upsertRuns(pool, []);
        expect(await readRuns(pool, 10)).toEqual([]);
    });
});

describe('readRuns', () => {
    it('returns the newest runs first, up to the limit', async () => {
        await upsertRuns(pool, [run(1, daysAgo(3)), run(2, daysAgo(1)), run(3, daysAgo(2))]);
        expect((await readRuns(pool, 2)).map((r) => r.id)).toEqual([2, 3]);
    });
});

describe('page role', () => {
    it('schema names no role', () => {
        expect(schemaSql).not.toMatch(/GRANT/i);
    });

    it('can read', async () => {
        await saveSuccess(pool, model, 1, new Date());
        const client = await pool.connect();
        try {
            await client.query(`SET ROLE ${pageRole}`);
            expect((await client.query('SELECT model FROM current_state')).rowCount).toBe(1);
            expect((await client.query('SELECT id FROM runs')).rowCount).toBe(0);
        } finally {
            await client.query('RESET ROLE');
            client.release();
        }
    });

    it('cannot write', async () => {
        const client = await pool.connect();
        try {
            await client.query(`SET ROLE ${pageRole}`);
            await expect(client.query('UPDATE current_state SET last_error = $1', ['x'])).rejects.toThrow(/permission denied/);
            await expect(client.query('DELETE FROM runs')).rejects.toThrow(/permission denied/);
        } finally {
            await client.query('RESET ROLE');
            client.release();
        }
    });
});
