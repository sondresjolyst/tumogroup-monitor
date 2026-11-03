import type { ReactNode } from 'react';
import { safeUrl } from '@/lib/model/sanitize';
import type { Tag } from '@/lib/model/types';

const GITHUB_REPO = /^[\w.-]+\/[\w.-]+$/;
const GITHUB_SOURCE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;
const SHORT_TEXT = 120;

export const NO_MATCH = 'No rows match the filters.';

const tableClass = 'w-full border-collapse text-sm max-md:block';
const headCellClass = 'border-b border-line py-1 pr-3 text-left text-xs font-medium text-muted';
const rowClass = 'border-b border-line max-md:flex max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-1 max-md:py-2';
const cellClass = 'py-1.5 pr-3 align-top max-md:block max-md:p-0';

/**
 * A table that becomes stacked rows below `md`. The display change would remove table semantics, so
 * each element states its role. `headHidden` keeps the column names for screen readers only.
 */
export function Table({ names, headHidden, children }: { names: string[]; headHidden?: boolean; children: ReactNode }) {
    return (
        <table role="table" className={tableClass}>
            <thead role="rowgroup" className={headHidden ? 'sr-only' : 'max-md:hidden'}>
                <tr role="row">
                    {names.map((name) => (
                        <th key={name} role="columnheader" scope="col" className={headCellClass}>
                            {name}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody role="rowgroup" className="max-md:block">
                {children}
            </tbody>
        </table>
    );
}

export function Row({ children }: { children: ReactNode }) {
    return (
        <tr role="row" className={rowClass}>
            {children}
        </tr>
    );
}

interface CellProps {
    /** The column name, shown on phones, where the table has no header row. */
    label?: string;
    /** For a value that explains itself. The name then only reaches screen readers. */
    labelHidden?: boolean;
    kind?: 'wide' | 'nowrap' | 'time';
    className?: string;
    children: ReactNode;
}

const CELL_KINDS = {
    wide: '[overflow-wrap:anywhere] max-md:w-full',
    nowrap: 'whitespace-nowrap',
    time: 'tabular-nums',
};

export function Cell({ label, labelHidden, kind, className, children }: CellProps) {
    return (
        <td role="cell" className={[cellClass, kind && CELL_KINDS[kind], className].filter(Boolean).join(' ')}>
            {label && (
                <span data-phone-label className={labelHidden ? 'sr-only md:hidden' : 'text-muted md:hidden'}>
                    {label}{' '}
                </span>
            )}
            {children}
        </td>
    );
}

/** A link that opens in a new tab. A missing or unsafe address renders the text alone, never an empty link. */
export function ExternalLink({ href, children }: { href: string | null | undefined; children: ReactNode }) {
    const url = safeUrl(href);
    if (!url) return <>{children}</>;
    return (
        <a href={url} target="_blank" rel="noreferrer" className="text-link hover:underline">
            {children}
        </a>
    );
}

export function repoUrl(repo: string): string | null {
    return GITHUB_REPO.test(repo) ? `https://github.com/${repo}` : null;
}

/** The short repo name, since every repo sits under one account. The link holds the full name. */
export function repoName(repo: string): string {
    return repo.slice(repo.indexOf('/') + 1);
}

export function RepoLink({ repo }: { repo: string }) {
    return <ExternalLink href={repoUrl(repo)}>{repoName(repo)}</ExternalLink>;
}

/** The releases page for a GitHub source. Other sources link to the source itself. */
export function releaseNotesUrl(sourceUrl: string | null | undefined): string | null {
    if (!sourceUrl) return null;
    return GITHUB_SOURCE.test(sourceUrl) ? `${sourceUrl.replace(/\/$/, '')}/releases` : sourceUrl;
}

export function Unavailable({ children }: { children: ReactNode }) {
    return <span className="text-muted">{children}</span>;
}

export function ReleaseNotes({ sourceUrl, fallback }: { sourceUrl: string | null | undefined; fallback: string }) {
    const url = safeUrl(releaseNotesUrl(sourceUrl));
    if (!url) return <Unavailable>{fallback}</Unavailable>;
    return <ExternalLink href={url}>Release notes</ExternalLink>;
}

export function Tags({ tags }: { tags: readonly Tag[] }) {
    return (
        <>
            {tags.map((tag) => (
                <span
                    key={tag}
                    className={`ml-1.5 inline-block rounded border px-1.5 text-xs whitespace-nowrap ${tag === 'Major' ? 'border-major-line bg-major-bg text-major-text' : 'border-line bg-surface text-muted'}`}
                >
                    {tag}
                </span>
            ))}
        </>
    );
}

/** Short text stays on the row. Longer text is cut on the row, with the whole text one select away. */
export function LongText({ text }: { text: string }) {
    if (text.length <= SHORT_TEXT) return <>{text}</>;
    return (
        <details>
            <summary className="cursor-pointer">{text.slice(0, SHORT_TEXT).trimEnd()}...</summary>
            <p className="mt-1 text-muted">{text}</p>
        </details>
    );
}

export function Section({ id, title, count, children }: { id: string; title: string; count: ReactNode; children: ReactNode }) {
    const headingId = `${id}-heading`;
    return (
        <section id={id} aria-labelledby={headingId} className="scroll-mt-4">
            <h2 id={headingId} className="mb-1.5 text-base font-semibold">
                {title}
                <span className="ml-2 text-sm font-normal text-muted tabular-nums">{count}</span>
            </h2>
            {children}
        </section>
    );
}

export function EmptyText({ children }: { children: ReactNode }) {
    return <p className="border-b border-line py-1.5 text-sm text-muted">{children}</p>;
}

/** The count in a heading, which reads "3 of 368" while a filter narrows the section. */
export function countText(shown: number, total: number): string {
    return shown === total ? String(total) : `${shown} of ${total}`;
}
