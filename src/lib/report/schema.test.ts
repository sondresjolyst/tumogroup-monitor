import { describe, expect, it } from 'vitest';
import fixture from '../model/fixtures/report.json';
import { parseReport, ReportFormatError } from './schema';

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
        const report = parseReport({ repositories: { 'a/b': { status: 'onboarded', branches: [], packageFiles: {} } } });
        expect(report.repositories['a/b'].problems).toEqual([]);
        expect(report.problems).toEqual([]);
    });

    it('throws with the failing path when a used field is missing', () => {
        const broken = structuredClone(fixture) as unknown as { repositories: Record<string, { status?: string }> };
        delete broken.repositories['example-org/app-two'].status;
        expect(() => parseReport(broken)).toThrow(ReportFormatError);
        try {
            parseReport(broken);
        } catch (error) {
            expect((error as ReportFormatError).path).toBe('repositories.example-org/app-two.status');
            expect((error as Error).message).toContain('repositories.example-org/app-two.status');
        }
    });

    it('tolerates null problems', () => {
        const report = parseReport({ ...fixture, problems: null });
        expect(report.problems).toEqual([]);
    });

    it('tolerates a repository with no branches', () => {
        const report = parseReport({ repositories: { 'a/b': { status: 'onboarded', packageFiles: {} } } });
        expect(report.repositories['a/b'].branches).toEqual([]);
    });

    it('tolerates null and missing lists and a null releaseTimestamp', () => {
        const report = parseReport({
            repositories: {
                'a/b': {
                    status: 'onboarded',
                    problems: null,
                    branches: [{ branchName: 'x', upgrades: null }],
                    packageFiles: {
                        npm: [{ deps: [{ depName: 'd', updates: [{ releaseTimestamp: null, pendingChecks: null }] }, { depName: 'e' }] }],
                    },
                },
            },
        });
        const deps = report.repositories['a/b'].packageFiles.npm[0].deps;
        expect(deps[0].updates[0].releaseTimestamp).toBeNull();
        expect(deps[1].updates).toEqual([]);
        expect(report.repositories['a/b'].branches[0].upgrades).toEqual([]);
    });

    it('accepts an update with no updateType', () => {
        const report = parseReport({
            repositories: { 'a/b': { status: 'onboarded', branches: [], packageFiles: { npm: [{ deps: [{ depName: 'd', updates: [{}] }] }] } } },
        });
        expect(report.repositories['a/b'].packageFiles.npm[0].deps[0].updates[0].updateType).toBeUndefined();
    });

    it('throws when the report is not an object', () => {
        expect(() => parseReport('nope')).toThrow(ReportFormatError);
    });

    it('names the root when the whole report is wrong', () => {
        try {
            parseReport(null);
            expect.unreachable();
        } catch (error) {
            expect((error as ReportFormatError).path).toBe('(root)');
        }
    });
});
