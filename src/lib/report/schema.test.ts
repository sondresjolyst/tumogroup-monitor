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
