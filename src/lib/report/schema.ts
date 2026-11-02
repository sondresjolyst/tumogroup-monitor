import { z } from 'zod';

const list = <T extends z.ZodType>(item: T) => z.array(item).nullish().transform((value) => value ?? []);

const updateSchema = z.object({
    updateType: z.string().nullish(),
    newVersion: z.string().nullish(),
    newValue: z.string().nullish(),
    branchName: z.string().nullish(),
    releaseTimestamp: z.string().nullish(),
    pendingChecks: z.boolean().nullish(),
});

const depSchema = z.object({
    depName: z.string(),
    sourceUrl: z.string().nullish(),
    currentVersionTimestamp: z.string().nullish(),
    isAbandoned: z.boolean().nullish(),
    deprecationMessage: z.string().nullish(),
    updates: list(updateSchema),
});

const packageFileSchema = z.object({
    deps: list(depSchema),
});

const branchSchema = z.object({
    branchName: z.string(),
    upgrades: list(z.object({ updateType: z.string().nullish() })),
});

const repositorySchema = z.object({
    status: z.string(),
    problems: list(z.unknown()),
    dependencyDashboardIssue: z.number().nullish(),
    branches: list(branchSchema),
    packageFiles: z
        .record(z.string(), list(packageFileSchema))
        .nullish()
        .transform((value) => value ?? {}),
});

const reportSchema = z.object({
    problems: list(z.unknown()),
    repositories: z.record(z.string(), repositorySchema),
});

export type ReportUpdate = z.infer<typeof updateSchema>;
export type ReportDep = z.infer<typeof depSchema>;
export type ReportRepository = z.infer<typeof repositorySchema>;
export type Report = z.infer<typeof reportSchema>;

export class ReportFormatError extends Error {
    constructor(
        readonly path: string,
        detail: string,
    ) {
        super(`Report format changed at ${path}: ${detail}`);
        this.name = 'ReportFormatError';
    }
}

export function parseReport(raw: unknown): Report {
    const result = reportSchema.safeParse(raw);
    if (result.success) return result.data;
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)';
    throw new ReportFormatError(path, issue.message);
}
