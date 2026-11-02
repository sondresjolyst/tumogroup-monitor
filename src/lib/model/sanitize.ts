import { redact } from '@/lib/redact';
import type { PageModel, PrRow, ProblemRow, UpdateRow } from './types';

/** Returns the URL when it is http or https, otherwise null. */
export function safeUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
    } catch {
        return null;
    }
}

const cleanPr = (row: PrRow): PrRow => ({ ...row, title: redact(row.title), url: safeUrl(row.url) ?? '' });

const cleanUpdate = (row: UpdateRow): UpdateRow => ({ ...row, sourceUrl: safeUrl(row.sourceUrl) });

const cleanProblem = (row: ProblemRow): ProblemRow => ({
    ...row,
    subject: row.subject === null ? null : redact(row.subject),
    message: redact(row.message),
});

/** Cleans free text and links in a model before it is stored. */
export function sanitizeModel(model: PageModel): PageModel {
    return {
        ...model,
        needsApproval: model.needsApproval.map(cleanPr),
        otherPrs: model.otherPrs.map(cleanPr),
        cooldown: model.cooldown.map(cleanUpdate),
        waiting: model.waiting.map(cleanUpdate),
        problems: model.problems.map(cleanProblem),
    };
}
