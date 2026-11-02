import { z } from 'zod';

// Odd rows are tolerated. A missing structure is not, because it would read as nothing waiting.
const list = <T extends z.ZodType>(item: T) => z.array(item).nullish().transform((value) => value ?? []);

const UNNAMED_DEP = 'Unnamed package';

const updateSchema = z.object({
    updateType: z.string().nullish(),
    newVersion: z.string().nullish(),
    newValue: z.string().nullish(),
    branchName: z.string().nullish(),
    releaseTimestamp: z.string().nullish(),
    pendingChecks: z.boolean().nullish(),
});

const depSchema = z.object({
    depName: z.string().nullish(),
    packageName: z.string().nullish(),
    sourceUrl: z.string().nullish(),
    currentVersionTimestamp: z.string().nullish(),
    isAbandoned: z.boolean().nullish(),
    deprecationMessage: z.string().nullish(),
    updates: z.array(updateSchema),
}).transform(({ depName, packageName, ...dep }) => ({ ...dep, depName: depName || packageName || UNNAMED_DEP }));

const packageFileSchema = z.object({
    deps: z.array(depSchema).transform((deps) => deps.filter((dep) => dep.depName !== UNNAMED_DEP || dep.updates.length > 0)),
});

const branchSchema = z.object({
    branchName: z.string(),
    result: z.string().nullish(),
    upgrades: list(z.object({ updateType: z.string().nullish() })),
});

const repositorySchema = z.object({
    status: z.string().nullish(),
    problems: list(z.unknown()),
    dependencyDashboardIssue: z.number().nullish(),
    branches: z.array(branchSchema),
    packageFiles: z.record(z.string(), z.array(packageFileSchema)),
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

/** A report with nothing in it would show empty sections, so it counts as a changed format. */
function assertHasData(report: Report): void {
    const repositories = Object.values(report.repositories);
    if (repositories.length === 0) throw new ReportFormatError('repositories', 'the report has no repositories');
    const hasNamedDep = repositories
        .filter((repository) => repository.status !== 'disabled')
        .flatMap((repository) => Object.values(repository.packageFiles))
        .flat()
        .some((file) => file.deps.some((dep) => dep.depName !== UNNAMED_DEP));
    if (!hasNamedDep) throw new ReportFormatError('repositories', 'no repository that is not disabled has a named dependency');
}

export function parseReport(raw: unknown): Report {
    const result = reportSchema.safeParse(raw);
    if (result.success) {
        assertHasData(result.data);
        return result.data;
    }
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)';
    throw new ReportFormatError(path, issue.message);
}
