import type { Pool } from 'pg';
import type { PageModel, WorkflowRun } from '@/lib/model/types';
import { schemaSql } from './schema';

export interface LatestState {
    model: PageModel | null;
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
        `UPDATE current_state
         SET model = $1::jsonb, report_run_id = $2, last_success_at = $3, last_error = NULL, last_error_at = NULL`,
        [JSON.stringify(model), reportRunId, at],
    );
}

export async function saveFailure(pool: Pool, message: string, at: Date): Promise<void> {
    await pool.query('UPDATE current_state SET last_error = $1, last_error_at = $2', [message, at]);
}

export async function upsertRuns(pool: Pool, runs: WorkflowRun[]): Promise<void> {
    if (runs.length > 0) {
        const byId = new Map(runs.map((run) => [run.id, run]));
        const unique = [...byId.values()];
        await pool.query(
            `INSERT INTO runs (id, event, started_at, updated_at, conclusion)
             SELECT * FROM unnest($1::bigint[], $2::text[], $3::timestamptz[], $4::timestamptz[], $5::text[])
             ON CONFLICT (id) DO UPDATE
             SET event = EXCLUDED.event,
                 started_at = EXCLUDED.started_at,
                 updated_at = EXCLUDED.updated_at,
                 conclusion = EXCLUDED.conclusion`,
            [
                unique.map((run) => run.id),
                unique.map((run) => run.event),
                unique.map((run) => run.startedAt),
                unique.map((run) => run.updatedAt),
                unique.map((run) => run.conclusion),
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
}

export async function readRuns(pool: Pool, limit: number): Promise<WorkflowRun[]> {
    const result = await pool.query<RunRecord>(
        'SELECT id, event, started_at, updated_at, conclusion FROM runs ORDER BY started_at DESC, id DESC LIMIT $1',
        [limit],
    );
    return result.rows.map((row) => ({
        id: Number(row.id),
        event: row.event,
        startedAt: row.started_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        conclusion: row.conclusion,
    }));
}

interface StateRecord {
    model: PageModel | null;
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
    return {
        model: row?.model ?? null,
        reportRunId: row?.report_run_id == null ? null : Number(row.report_run_id),
        lastSuccessAt: row?.last_success_at ?? null,
        lastError: row?.last_error ?? null,
        lastErrorAt: row?.last_error_at ?? null,
    };
}
