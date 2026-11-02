import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseReport } from '@/lib/report/schema';
import { buildModel } from './build';
import { redact } from '@/lib/redact';
import { safeUrl, sanitizeModel } from './sanitize';
import type { PageModel, PrRow, ProblemRow, UpdateRow } from './types';

const report = JSON.parse(readFileSync(new URL('./fixtures/report.json', import.meta.url), 'utf8'));

const emptyModel = (): PageModel => ({
    modelVersion: 1,
    counts: { needsApproval: 0, cooldown: 0, waiting: 0, otherPrs: 0, noReleaseDate: 0, problems: 0 },
    needsApproval: [],
    cooldown: [],
    waiting: [],
    otherPrs: [],
    problems: [],
    warnings: [],
});

const update = (sourceUrl: string | null): UpdateRow => ({
    repo: 'example-org/app-one',
    branch: 'renovate/x',
    dep: 'x',
    newVersion: '1',
    updateType: 'minor',
    sourceUrl,
    dashboardIssue: null,
    tags: [],
    releaseTimestamp: null,
    cooldownEnd: null,
    daysLeft: null,
    expectedPr: 'x',
});

const pr = (url: string): PrRow => ({
    repo: 'example-org/app-one',
    number: 1,
    title: 'title postgres://app:hunter2@db.example/x',
    url,
    branch: 'renovate/x',
    createdAt: '2026-10-30T06:00:00Z',
    checks: 'none',
    tags: [],
    sourceUrl: 'javascript:alert(2)',
});

describe('safeUrl', () => {
    it('allows only http and https', () => {
        expect(safeUrl('https://github.com/a/b')).toBe('https://github.com/a/b');
        expect(safeUrl('http://example.org/')).toBe('http://example.org/');
        expect(safeUrl('javascript:alert(1)')).toBeNull();
        expect(safeUrl('data:text/html,hi')).toBeNull();
        expect(safeUrl('not a url')).toBeNull();
        expect(safeUrl(null)).toBeNull();
    });

    it('clears userinfo from an http url', () => {
        const result = safeUrl('https://user:hunter2@example.org/path?x=1') ?? '';
        expect(result).not.toContain('hunter2');
        expect(result).not.toContain('user');
        expect(result).toContain('example.org/path?x=1');
    });
});

describe('sanitizeModel', () => {
    it('drops javascript links from update rows and pull requests', () => {
        const model = { ...emptyModel(), cooldown: [update('javascript:alert(1)')], waiting: [update('https://ok.example/')] };
        model.needsApproval = [pr('javascript:alert(1)')];
        model.otherPrs = [pr('https://github.com/a/b/pull/1')];
        const result = sanitizeModel(model);
        expect(result.cooldown[0].sourceUrl).toBeNull();
        expect(result.waiting[0].sourceUrl).toBe('https://ok.example/');
        expect(result.needsApproval[0].url).toBe('');
        expect(result.needsApproval[0].sourceUrl).toBeNull();
        expect(result.otherPrs[0].url).toBe('https://github.com/a/b/pull/1');
    });

    it('redacts a URL password in problem text, subjects and titles', () => {
        const problem: ProblemRow = {
            kind: 'repo',
            repo: 'example-org/app-one',
            subject: 'dep',
            message: 'Cannot reach https://user:hunter2@registry.example/pkg or ghs_Abcdefghijklmnop123',
        };
        const model = { ...emptyModel(), problems: [problem], needsApproval: [pr('https://github.com/a/b/pull/1')] };
        const text = JSON.stringify(sanitizeModel(model));
        expect(text).not.toContain('hunter2');
        expect(text).not.toContain('ghs_');
    });
});

describe('buildModel problem text', () => {
    it('uses a placeholder rather than dumping an unknown problem object', () => {
        const odd = { ...report, problems: [{ password: 'hunter2', other: 1 }] };
        const model = buildModel(parseReport(odd), [], [], new Date('2026-11-02T10:00:00Z'));
        const text = JSON.stringify(model);
        expect(text).not.toContain('hunter2');
        expect(model.problems.some((row) => row.message === 'Renovate reported a problem')).toBe(true);
    });
});

describe('sanitizeModel generic walk', () => {
    it('removes userinfo from a sourceUrl', () => {
        const result = sanitizeModel({ ...emptyModel(), waiting: [update('https://u:hunter2@ok.example/x')] });
        expect(result.waiting[0].sourceUrl).not.toContain('hunter2');
    });

    it('redacts strings in any field, including new ones', () => {
        const model = {
            ...emptyModel(),
            warnings: [{ kind: 'no-sunday-run', message: 'see ghs_Abcdefghijklmnop123' }],
            newField: [{ text: 'ghs_Abcdefghijklmnop123', at: '2026-11-01T02:00:00.000Z' }],
        } as PageModel;
        const text = JSON.stringify(sanitizeModel(model));
        expect(text).not.toContain('ghs_');
        expect(text).toContain('2026-11-01T02:00:00.000Z');
    });

    it('keeps dependency names, versions with digests and branch names', () => {
        const digest = 'sha256:' + 'a'.repeat(64);
        const row = { ...update(null), dep: 'example/base-image', newVersion: digest, branch: 'renovate/' + 'b'.repeat(60) };
        const result = sanitizeModel({ ...emptyModel(), waiting: [row] });
        expect(result.waiting[0]).toMatchObject({ dep: row.dep, newVersion: digest, branch: row.branch });
    });

    it('truncates long problem text', () => {
        const problem: ProblemRow = { kind: 'repo', repo: null, subject: null, message: 'word '.repeat(400) };
        const result = sanitizeModel({ ...emptyModel(), problems: [problem] });
        expect(result.problems[0].message.length).toBeLessThanOrEqual(503);
    });
});

describe('redact bounds', () => {
    it('returns fast on hostile input', () => {
        const hostile = ['a://' + 'x'.repeat(200_000), 'a://'.repeat(50_000), 'a'.repeat(200_000) + '://@', '-----BEGIN PRIVATE KEY-----'.repeat(5_000)];
        for (const text of hostile) {
            const start = performance.now();
            redact(text);
            expect(performance.now() - start).toBeLessThan(500);
        }
    });

    it('does not run past 512 characters of userinfo', () => {
        const long = 'postgres://' + 'u'.repeat(600) + '@host/db';
        expect(redact(long)).toContain('@host/db');
    });
});
