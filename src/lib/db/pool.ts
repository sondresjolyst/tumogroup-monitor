import 'server-only';
import { Pool } from 'pg';
import type { WorkflowRun } from '@/lib/model/types';
import { readLatest, readRuns, type LatestState } from './store';

/** More than the page shows, so the report's run is found in the list when the report is recent. */
const RUNS_TO_READ = 200;

let pool: Pool | null = null;

function getPool(): Pool {
    if (pool) return pool;
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 3,
        connectionTimeoutMillis: 5_000,
        statement_timeout: 10_000,
        query_timeout: 10_000,
    });
    pool.on('error', () => {});
    return pool;
}

export interface PageData {
    state: LatestState | null;
    runs: WorkflowRun[];
}

/** Returns a null state when the database cannot be read. Error text can hold a connection string, so it is not logged. */
export async function readPageData(): Promise<PageData> {
    try {
        const current = getPool();
        const [state, runs] = await Promise.all([readLatest(current), readRuns(current, RUNS_TO_READ)]);
        return { state, runs };
    } catch (error) {
        const { name, code } = error as { name?: unknown; code?: unknown };
        console.error(`Could not read the database. name=${String(name)} code=${String(code)}`);
        return { state: null, runs: [] };
    }
}
