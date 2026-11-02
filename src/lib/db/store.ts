import type { Pool } from 'pg';
import { MODEL_VERSION, type PageModel, type WorkflowRun } from '@/lib/model/types';
import { schemaSql } from './schema';

const UNDEFINED_TABLE = '42P01';

export interface LatestState {
    model: PageModel | null;
    /** A model is stored, but of another version, so the page cannot read it until the next refresh. */
    modelOutdated: boolean;
    reportRunId: number | null;
    lastSuccessAt: Date | null;
    lastError: string | null;
    lastErrorAt: Date | null;
}

export async function applySchema(pool: Pool): Promise<void> {
    await pool.query(schemaSql);
}

export async function saveSuccess(pool: Pool, model: PageModel, reportRunId: number, at: Date): Promise<void> {
    await pool.query(
        `INSERT INTO current_state (id, model, report_run_id, last_success_at, last_error, last_error_at)
         VALUES (true, $1::jsonb, $2, $3, NULL, NULL)
         ON CONFLICT (id) DO UPDATE
         SET model = EXCLUDED.model,
             report_run_id = EXCLUDED.report_run_id,
             last_success_at = EXCLUDED.last_success_at,
             last_error = NULL,
             last_error_at = NULL`,
        [JSON.stringify(model), reportRunId, at],
    );
}

export async function saveFailure(pool: Pool, message: string, at: Date): Promise<void> {
    await pool.query(
        `INSERT INTO current_state (id, last_error, last_error_at)
         VALUES (true, $1, $2)
         ON CONFLICT (id) DO UPDATE
         SET last_error = EXCLUDED.last_error, last_error_at = EXCLUDED.last_error_at`,
        [message, at],
    );
}

export async function upsertRuns(pool: Pool, runs: WorkflowRun[]): Promise<void> {
    if (runs.length > 0) {
        const byId = new Map(runs.map((run) => [run.id, run]));
        const unique = [...byId.values()];
        await pool.query(
            `INSERT INTO runs (id, event, started_at, updated_at, conclusion, head_branch)
             SELECT * FROM unnest($1::bigint[], $2::text[], $3::timestamptz[], $4::timestamptz[], $5::text[], $6::text[])
             ON CONFLICT (id) DO UPDATE
             SET event = EXCLUDED.event,
                 started_at = EXCLUDED.started_at,
                 updated_at = EXCLUDED.updated_at,
                 conclusion = EXCLUDED.conclusion,
                 head_branch = EXCLUDED.head_branch`,
            [
                unique.map((run) => run.id),
                unique.map((run) => run.event),
                unique.map((run) => run.startedAt),
                unique.map((run) => run.updatedAt),
                unique.map((run) => run.conclusion),
                unique.map((run) => run.headBranch),
            ],
        );
    }
    await pool.query("DELETE FROM runs WHERE started_at < now() - interval '90 days'");
}

interface RunRecord {
    id: string;
    event: string;
    started_at: Date;
    updated_at: Date;
    conclusion: string | null;
    head_branch?: string | null;
}

export async function readRuns(pool: Pool, limit: number): Promise<WorkflowRun[]> {
    // Every column, because only the job can add head_branch, and a new page can start before the job has run.
    const result = await pool.query<RunRecord>(
        'SELECT * FROM runs ORDER BY started_at DESC, id DESC LIMIT $1',
        [limit],
    );
    return result.rows.map((row) => ({
        id: Number(row.id),
        event: row.event,
        headBranch: row.head_branch ?? null,
        startedAt: row.started_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        conclusion: row.conclusion,
    }));
}

interface StateRecord {
    model: Partial<PageModel> | null;
    report_run_id: string | null;
    last_success_at: Date | null;
    last_error: string | null;
    last_error_at: Date | null;
}

export async function readLatest(pool: Pool): Promise<LatestState> {
    const result = await pool.query<StateRecord>(
        'SELECT model, report_run_id, last_success_at, last_error, last_error_at FROM current_state',
    );
    const row = result.rows[0];
    const current = row?.model?.modelVersion === MODEL_VERSION;
    return {
        model: current ? (row.model as PageModel) : null,
        modelOutdated: Boolean(row?.model) && !current,
        reportRunId: row?.report_run_id == null ? null : Number(row.report_run_id),
        lastSuccessAt: row?.last_success_at ?? null,
        lastError: row?.last_error ?? null,
        lastErrorAt: row?.last_error_at ?? null,
    };
}

export interface PageState {
    state: LatestState;
    runs: WorkflowRun[];
}

/** Before the first refresh the job has not made the tables, which is an empty state and not a failure. */
export async function readPageState(pool: Pool, runLimit: number): Promise<PageState> {
    try {
        const [state, runs] = await Promise.all([readLatest(pool), readRuns(pool, runLimit)]);
        return { state, runs };
    } catch (error) {
        if ((error as { code?: unknown }).code !== UNDEFINED_TABLE) throw error;
        return {
            state: { model: null, modelOutdated: false, reportRunId: null, lastSuccessAt: null, lastError: null, lastErrorAt: null },
            runs: [],
        };
    }
}
