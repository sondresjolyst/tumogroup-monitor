import { Pool } from 'pg';
import { applySchema, saveSuccess, upsertRuns } from '@/lib/db/store';
import { buildModel } from '@/lib/model/build';
import fixture from '@/lib/model/fixtures/report.json';
import { sanitizeModel } from '@/lib/model/sanitize';
import type { RenovatePr, WorkflowRun } from '@/lib/model/types';
import { parseReport } from '@/lib/report/schema';

// The rows stay in the same sections on any day, because they are built for one fixed time.
const MODEL_TIME = new Date('2026-11-02T17:00:00Z');
const HOUR_MS = 60 * 60 * 1000;

const AUTOMERGE = '**Automerge**: Enabled.';
const MANUAL = '**Automerge**: Disabled by config.';

const pr = (repo: string, number: number, branch: string, title: string, body: string, checks: RenovatePr['checks'], url: string | null = null): RenovatePr => ({
    repo,
    number,
    title,
    url: url ?? `https://github.com/${repo}/pull/${number}`,
    branch,
    createdAt: '2026-10-28T06:00:00Z',
    body,
    checks,
    labels: [],
});

const prs = [
    pr('example-org/app-one', 41, 'renovate/vite-9.x', 'chore(deps): update vite to v9', MANUAL, 'failing'),
    pr('example-org/app-two', 42, 'renovate/github-actions', 'chore(deps): update actions/checkout to v7.0.2', MANUAL, 'passing'),
    pr('example-org/app-two', 43, 'renovate/nuget-dependencies', '<img src=x onerror=alert(1)> update nuget group', AUTOMERGE, 'pending'),
    pr('example-org/app-one', 44, 'renovate/python-3.x', 'A PR with no address', AUTOMERGE, 'none', ''),
];

// The newest run on main is 33 hours old on the real clock, so the page must warn that the data is old.
const seedTime = Date.now();
const runs: WorkflowRun[] = [
    { id: 9003, event: 'workflow_dispatch', headBranch: 'example/test-branch', startedAt: new Date(seedTime - HOUR_MS).toISOString(), updatedAt: new Date(seedTime - HOUR_MS + 60_000).toISOString(), conclusion: 'failure' },
    { id: 9002, event: 'schedule', headBranch: 'main', startedAt: new Date(seedTime - 33 * HOUR_MS).toISOString(), updatedAt: new Date(seedTime - 33 * HOUR_MS + 300_000).toISOString(), conclusion: 'success' },
    { id: 9001, event: 'workflow_dispatch', headBranch: 'main', startedAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:04:00Z', conclusion: 'failure' },
];

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        await applySchema(pool);
        await upsertRuns(pool, runs);
        const model = sanitizeModel(buildModel(parseReport(fixture), prs, [runs[2]], MODEL_TIME));
        await saveSuccess(pool, model, 9002, new Date(seedTime - 33 * HOUR_MS));
    } finally {
        await pool.end();
    }
}

main().catch(() => {
    console.error('Could not seed the database.');
    process.exitCode = 1;
});
