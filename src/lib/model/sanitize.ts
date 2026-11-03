import { redact } from '@/lib/redact';
import type { PageModel } from './types';

const MAX_TEXT = 500;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;
// Names, versions and digests can hold long runs of letters and digits that are not secrets.
const KEEP_LONG_RUNS = new Set(['dep', 'newVersion', 'branch', 'repo', 'subject']);
const LONG_TEXT = new Set(['message']);

/** Returns the URL without userinfo when it is http or https, otherwise null. */
export function safeUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        if (url.username || url.password) {
            url.username = '';
            url.password = '';
            return redact(url.toString());
        }
        return redact(value);
    } catch {
        return null;
    }
}

function clean(value: unknown, key: string): unknown {
    if (typeof value === 'string') {
        if (key === 'url') return safeUrl(value) ?? '';
        if (key === 'sourceUrl') return safeUrl(value);
        if (ISO_TIMESTAMP.test(value)) return value;
        const text = LONG_TEXT.has(key) && value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}...` : value;
        return redact(text, { keepLongRuns: KEEP_LONG_RUNS.has(key) });
    }
    if (Array.isArray(value)) return value.map((item) => clean(item, key));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, clean(item, name)]));
    }
    return value;
}

/** Redacts every string in the model and limits links to http and https, so new fields are covered. */
export function sanitizeModel(model: PageModel): PageModel {
    return clean(model, '') as PageModel;
}
