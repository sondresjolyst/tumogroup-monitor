import { describe, expect, it } from 'vitest';
import fixture from '../model/fixtures/report.json';
import { parseReport, ReportFormatError } from './schema';

const repoWith = (fields: Record<string, unknown> = {}) => ({
    status: 'onboarded',
    branches: [],
    packageFiles: { npm: [{ deps: [{ depName: 'd', updates: [] }] }] },
    ...fields,
});

const reportWith = (fields: Record<string, unknown> = {}) => ({ repositories: { 'a/b': repoWith(fields) } });

const formatErrorPath = (raw: unknown) => {
    try {
        parseReport(raw);
    } catch (error) {
        expect(error).toBeInstanceOf(ReportFormatError);
        return (error as ReportFormatError).path;
    }
    return expect.unreachable('parseReport accepted the report');
};

describe('parseReport', () => {
    it('reads the fixture', () => {
        const report = parseReport(fixture);
        expect(Object.keys(report.repositories)).toHaveLength(4);
        expect(report.repositories['example-org/app-one'].status).toBe('onboarded');
    });

    it('keeps unknown keys out of the way', () => {
        const report = parseReport({ ...fixture, newTopLevelKey: 1 });
        expect(report.repositories['example-org/app-two'].branches).toHaveLength(4);
    });

    it('accepts a report with only the fields the page uses', () => {
        const report = parseReport(reportWith());
        expect(report.repositories['a/b'].problems).toEqual([]);
        expect(report.problems).toEqual([]);
    });

    it('throws with the failing path when a used field has the wrong type', () => {
        const broken = structuredClone(fixture) as unknown as { repositories: Record<string, { status?: unknown }> };
        broken.repositories['example-org/app-two'].status = 3;
        expect(formatErrorPath(broken)).toBe('repositories.example-org/app-two.status');
    });

    it('tolerates null problems', () => {
        const report = parseReport({ ...fixture, problems: null });
        expect(report.problems).toEqual([]);
    });

    it('tolerates null and missing odd row fields and a null releaseTimestamp', () => {
        const report = parseReport(
            reportWith({
                problems: null,
                branches: [{ branchName: 'x', upgrades: null }],
                packageFiles: { npm: [{ deps: [{ depName: 'd', updates: [{ releaseTimestamp: null, pendingChecks: null }] }] }] },
            }),
        );
        expect(report.repositories['a/b'].packageFiles.npm[0].deps[0].updates[0].releaseTimestamp).toBeNull();
        expect(report.repositories['a/b'].branches[0].upgrades).toEqual([]);
    });

    it('accepts an update with no updateType', () => {
        const report = parseReport(reportWith({ packageFiles: { npm: [{ deps: [{ depName: 'd', updates: [{}] }] }] } }));
        expect(report.repositories['a/b'].packageFiles.npm[0].deps[0].updates[0].updateType).toBeUndefined();
    });

    it('throws when the report is not an object', () => {
        expect(() => parseReport('nope')).toThrow(ReportFormatError);
    });

    it('names the root when the whole report is wrong', () => {
        expect(formatErrorPath(null)).toBe('(root)');
    });
});

describe('parseReport with a changed report structure', () => {
    const rename = (from: string, to: string) => JSON.parse(JSON.stringify(fixture).replaceAll(`"${from}":`, `"${to}":`));

    it.each([
        ['packageFiles', 'repositories.example-org/app-one.packageFiles'],
        ['branches', 'repositories.example-org/app-one.branches'],
        ['deps', 'repositories.example-org/app-one.packageFiles.npm.0.deps'],
        ['updates', 'repositories.example-org/app-one.packageFiles.npm.0.deps.0.updates'],
    ])('throws when %s is renamed', (key, path) => {
        expect(formatErrorPath(rename(key, `${key}Renamed`))).toBe(path);
    });

    it.each(['packageFiles', 'branches'])('throws when %s is null', (key) => {
        expect(formatErrorPath(reportWith({ [key]: null }))).toBe(`repositories.a/b.${key}`);
    });

    it('throws when a list of package files is null', () => {
        expect(formatErrorPath(reportWith({ packageFiles: { npm: null } }))).toBe('repositories.a/b.packageFiles.npm');
    });

    it('throws when the report has no repositories', () => {
        expect(formatErrorPath({ repositories: {} })).toBe('repositories');
    });

    it('throws when the repositories key is renamed', () => {
        expect(formatErrorPath(rename('repositories', 'repos'))).toBe('repositories');
    });

    it('throws when no repository that is not disabled has a dep', () => {
        expect(formatErrorPath(reportWith({ packageFiles: {} }))).toBe('repositories');
        expect(formatErrorPath({ repositories: { 'a/b': repoWith({ status: 'disabled' }) } })).toBe('repositories');
    });

    it('accepts a repository with no deps when another one has them', () => {
        const report = parseReport({ repositories: { 'a/b': repoWith(), 'a/c': repoWith({ packageFiles: {} }) } });
        expect(Object.keys(report.repositories)).toEqual(['a/b', 'a/c']);
    });

    it('throws when every dep has lost its name', () => {
        expect(formatErrorPath(reportWith({ packageFiles: { npm: [{ deps: [{ updates: [{}] }, { updates: [] }] }] } }))).toBe('repositories');
    });
});

describe('parseReport with odd rows', () => {
    const deps = (...items: unknown[]) => {
        const report = parseReport(reportWith({ packageFiles: { npm: [{ deps: [{ depName: 'named', updates: [] }, ...items] }] } }));
        return report.repositories['a/b'].packageFiles.npm[0].deps.slice(1);
    };

    it('skips a dep with no name and no updates', () => {
        expect(deps({ updates: [] })).toEqual([]);
    });

    it('falls back to packageName for a dep with no depName', () => {
        expect(deps({ packageName: 'example/from-package', updates: [{}] })[0].depName).toBe('example/from-package');
        expect(deps({ depName: null, packageName: 'example/from-package', updates: [] })[0].depName).toBe('example/from-package');
    });

    it('keeps a dep with updates and no name, so the update still lists', () => {
        const [dep] = deps({ updates: [{ newVersion: '2.0.0' }] });
        expect(dep.depName).toBe('Unnamed package');
        expect(dep.updates).toHaveLength(1);
    });

    it.each([[undefined], [null]])('accepts a repository with status %s', (status) => {
        expect(parseReport(reportWith({ status })).repositories['a/b'].status ?? null).toBeNull();
    });
});
