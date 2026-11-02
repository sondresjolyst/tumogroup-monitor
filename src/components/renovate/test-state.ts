import type { LatestState } from '@/lib/db/store';
import type { PageModel, PrRow, ProblemRow, UpdateRow, WorkflowRun } from '@/lib/model/types';

export const NOW = new Date('2026-11-02T17:00:00Z');

export const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

export const pr = (overrides: Partial<PrRow> = {}): PrRow => ({
    repo: 'example-org/app-one',
    number: 11,
    title: 'Update vite to v9',
    url: 'https://github.com/example-org/app-one/pull/11',
    branch: 'renovate/vite-9.x',
    createdAt: '2026-10-30T17:00:00Z',
    checks: 'passing',
    tags: [],
    sourceUrl: 'https://github.com/example-vendor/vite',
    ...overrides,
});

export const update = (overrides: Partial<UpdateRow> = {}): UpdateRow => ({
    repo: 'example-org/app-one',
    branch: 'renovate/typescript-7.x',
    dep: 'typescript',
    newVersion: '7.1.0',
    updateType: 'minor',
    sourceUrl: 'https://github.com/example-vendor/typescript',
    dashboardIssue: 12,
    tags: [],
    releaseTimestamp: '2026-10-30T17:00:00Z',
    cooldownEnd: '2026-11-06T17:00:00Z',
    daysLeft: 4,
    expectedPr: '2026-11-08T02:15:00.000Z',
    ...overrides,
});

export const problem = (overrides: Partial<ProblemRow> = {}): ProblemRow => ({
    kind: 'deprecated',
    repo: 'example-org/app-one',
    subject: 'uuidv4',
    message: 'Use the uuid package.',
    ...overrides,
});

export const workflowRun = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
    id: 501,
    event: 'schedule',
    startedAt: '2026-11-02T02:20:00Z',
    updatedAt: '2026-11-02T02:25:30Z',
    conclusion: 'success',
    ...overrides,
});

export const model = (overrides: Partial<PageModel> = {}): PageModel => ({
    counts: { needsApproval: 0, cooldown: 0, waiting: 0, otherPrs: 0, noReleaseDate: 0, problems: 0 },
    needsApproval: [],
    cooldown: [],
    waiting: [],
    otherPrs: [],
    problems: [],
    warnings: [],
    ...overrides,
});

export const state = (overrides: Partial<LatestState> = {}): LatestState => ({
    model: model(),
    reportRunId: null,
    lastSuccessAt: hoursAgo(1),
    lastError: null,
    lastErrorAt: null,
    ...overrides,
});
