export type ChecksState = 'failing' | 'pending' | 'passing' | 'none';

export type Tag = 'Major' | 'No release date';

export interface RenovatePr {
    repo: string;
    number: number;
    title: string;
    url: string;
    branch: string;
    createdAt: string;
    body: string | null;
    checks: ChecksState;
    labels: string[];
}

export interface WorkflowRun {
    id: number;
    event: string;
    startedAt: string;
    updatedAt: string;
    conclusion: string | null;
}

export interface PrRow {
    repo: string;
    number: number;
    title: string;
    url: string;
    branch: string;
    createdAt: string;
    checks: ChecksState;
    tags: Tag[];
    sourceUrl: string | null;
}

export interface UpdateRow {
    repo: string;
    branch: string;
    dep: string;
    newVersion: string;
    updateType: string;
    sourceUrl: string | null;
    dashboardIssue: number | null;
    tags: Tag[];
    releaseTimestamp: string | null;
    cooldownEnd: string | null;
    daysLeft: number | null;
    expectedPr: string;
}

export type ProblemKind = 'abandoned' | 'deprecated' | 'repo' | 'disabled' | 'report';

export interface ProblemRow {
    kind: ProblemKind;
    repo: string | null;
    subject: string | null;
    message: string;
}

export interface RunRow {
    id: number;
    event: string;
    plannedSlot: string | null;
    startedAt: string;
    durationMs: number;
    conclusion: string | null;
}

export type WarningKind = 'no-sunday-run' | 'late-sunday-run' | 'failed-sunday-run';

export interface Warning {
    kind: WarningKind;
    message: string;
}

export interface Counts {
    needsApproval: number;
    cooldown: number;
    waiting: number;
    otherPrs: number;
    noReleaseDate: number;
    problems: number;
}

export interface PageModel {
    counts: Counts;
    needsApproval: PrRow[];
    cooldown: UpdateRow[];
    waiting: UpdateRow[];
    otherPrs: PrRow[];
    problems: ProblemRow[];
    warnings: Warning[];
}
