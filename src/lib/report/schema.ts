import { z } from 'zod';

const updateSchema = z.object({
    updateType: z.string(),
    newVersion: z.string().optional(),
    newValue: z.string().optional(),
    branchName: z.string().optional(),
    releaseTimestamp: z.string().optional(),
    pendingChecks: z.boolean().optional(),
});

const depSchema = z.object({
    depName: z.string(),
    sourceUrl: z.string().optional(),
    isAbandoned: z.boolean().optional(),
    deprecationMessage: z.string().optional(),
    updates: z.array(updateSchema).default([]),
});

const packageFileSchema = z.object({
    deps: z.array(depSchema).default([]),
});

const branchSchema = z.object({
    branchName: z.string(),
    upgrades: z
        .array(z.object({ updateType: z.string().optional() }))
        .default([]),
});

const repositorySchema = z.object({
    status: z.string(),
    problems: z.array(z.unknown()).default([]),
    dependencyDashboardIssue: z.number().nullish(),
    branches: z.array(branchSchema),
    packageFiles: z.record(z.string(), z.array(packageFileSchema)),
});

const reportSchema = z.object({
    problems: z.array(z.unknown()).default([]),
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
