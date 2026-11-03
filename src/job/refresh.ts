import { Pool } from 'pg';
import { GitHubError, createClient, redact, type GitHubClient } from '@/lib/github/client';
import { applySchema, readRuns, saveFailure, saveSuccess, upsertRuns } from '@/lib/db/store';
import { buildModel } from '@/lib/model/build';
import { sanitizeModel } from '@/lib/model/sanitize';
import type { PageModel, WorkflowRun } from '@/lib/model/types';
import { ReportFormatError, parseReport } from '@/lib/report/schema';

/** Enough stored runs to cover the 90 day history window. */
const HISTORY_LIMIT = 2000;

export interface Store {
    applySchema(): Promise<void>;
    upsertRuns(runs: WorkflowRun[]): Promise<void>;
    readRuns(limit: number): Promise<WorkflowRun[]>;
    saveSuccess(model: PageModel, reportRunId: number, at: Date): Promise<void>;
    saveFailure(message: string, at: Date): Promise<void>;
}

export interface RefreshDeps {
    client: GitHubClient;
    store: Store;
    log?: (message: string) => void;
}

export function createStore(pool: Pool): Store {
    return {
        applySchema: () => applySchema(pool),
        upsertRuns: (runs) => upsertRuns(pool, runs),
        readRuns: (limit) => readRuns(pool, limit),
        saveSuccess: (model, reportRunId, at) => saveSuccess(pool, model, reportRunId, at),
        saveFailure: (message, at) => saveFailure(pool, message, at),
    };
}

class NoReportError extends Error {
    constructor() {
        super('No Renovate report was found in the recent workflow runs');
        this.name = 'NoReportError';
    }
}

/** Builds the text shown on the page. It names what failed and never echoes raw error text. */
export function safeMessage(error: unknown): string {
    let message: string;
    if (error instanceof ReportFormatError) {
        message = `The Renovate report has an unexpected format at ${error.path}.`;
    } else if (error instanceof NoReportError) {
        message = 'No Renovate report artifact was found in the recent workflow runs.';
    } else if (error instanceof GitHubError) {
        message = `${error.message}.`;
    } else {
        message = 'The refresh failed for an unexpected reason. See the job log for the error code.';
    }
    return redact(message);
}

const SAFE_TOKEN = /^[A-Za-z0-9_.-]{1,40}$/;

const safeToken = (value: unknown): string | null => (typeof value === 'string' && SAFE_TOKEN.test(value) ? value : null);

/** Names and codes only. The message of an error can hold connection strings, so it is never logged. */
export function describeError(error: unknown): string {
    if (!error || typeof error !== 'object') return 'error=unknown';
    const record = error as { name?: unknown; code?: unknown; cause?: unknown };
    const cause = record.cause && typeof record.cause === 'object' ? (record.cause as { code?: unknown }) : null;
    const parts = [
        ['name', safeToken(record.name)],
        ['code', safeToken(record.code)],
        ['cause', safeToken(cause?.code)],
    ];
    return parts.filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join(' ') || 'error=unknown';
}

export async function refresh(deps: RefreshDeps, now: Date): Promise<void> {
    const { client, store } = deps;
    const log = deps.log ?? console.log;
    try {
        await store.applySchema();
        const fetched = await client.listRuns();
        await store.upsertRuns(fetched);
        log(`Saved ${fetched.length} workflow runs.`);
        const found = await client.downloadLatestReport();
        if (!found) throw new NoReportError();
        const report = parseReport(found.raw);
        const prs = await client.listOpenRenovatePrs();
        const runs = await store.readRuns(HISTORY_LIMIT);
        const model = sanitizeModel(buildModel(report, prs, runs, now));
        await store.saveSuccess(model, found.runId, now);
        log(`Saved the page model from report run ${found.runId} with ${prs.length} open pull requests.`);
    } catch (error) {
        const message = safeMessage(error);
        log(`Refresh failed: ${message} (${describeError(error)})`);
        try {
            await store.saveFailure(message, now);
        } catch {
            log('Could not save the failure message.');
        }
        throw error;
    }
}

/** Returns the process exit code. */
export async function runJob(deps: RefreshDeps, now: Date): Promise<number> {
    const log = deps.log ?? console.log;
    try {
        await refresh(deps, now);
        return 0;
    } catch {
        log('Job failed.');
        return 1;
    }
}

export async function main(env: Record<string, string | undefined>, makeStore: (pool: Pool) => Store = createStore): Promise<number> {
    if (!env.DATABASE_URL) {
        console.error('DATABASE_URL is not set.');
        return 1;
    }
    let pool: Pool | null = null;
    try {
        pool = new Pool({
            connectionString: env.DATABASE_URL,
            connectionTimeoutMillis: 30_000,
            statement_timeout: 60_000,
            query_timeout: 60_000,
        });
        pool.on('error', () => {});
        const store = makeStore(pool);
        let client: GitHubClient;
        try {
            client = createClient(env);
        } catch (error) {
            const message = safeMessage(error);
            console.error(`Job failed: ${message} (${describeError(error)})`);
            try {
                await store.applySchema();
                await store.saveFailure(message, new Date());
            } catch (saveError) {
                console.error(`Could not save the failure message (${describeError(saveError)}).`);
            }
            return 1;
        }
        return await runJob({ client, store }, new Date());
    } catch (error) {
        console.error(`Job failed (${describeError(error)}).`);
        return 1;
    } finally {
        await pool?.end().catch(() => {});
    }
}
