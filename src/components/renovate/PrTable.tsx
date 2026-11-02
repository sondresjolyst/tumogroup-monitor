import type { ChecksState, PrRow } from '@/lib/model/types';
import { formatAge } from './format';
import {
    ExternalLink,
    ReleaseNotes,
    RepoLink,
    Tags,
    bodyClass,
    cellClass,
    headCellClass,
    headClass,
    rowClass,
    tableClass,
    timeCellClass,
    wideCellClass,
} from './ui';

const CHECKS: Record<ChecksState, { label: string; className: string }> = {
    failing: { label: 'Failing', className: 'text-bad font-medium' },
    pending: { label: 'Pending', className: 'text-pending' },
    passing: { label: 'Passing', className: 'text-good' },
    none: { label: 'No checks', className: 'text-muted' },
};

export function PrTable({ rows, now }: { rows: PrRow[]; now: number }) {
    return (
        <table className={tableClass}>
            <thead className={headClass}>
                <tr>
                    {['Repo', 'Title', 'Age', 'Checks', 'Links'].map((name) => (
                        <th key={name} scope="col" className={headCellClass}>
                            {name}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody className={bodyClass}>
                {rows.map((row) => {
                    const checks = CHECKS[row.checks] ?? CHECKS.none;
                    return (
                        <tr key={`${row.repo}#${row.number}`} className={rowClass}>
                            <td className={`${cellClass} whitespace-nowrap`}>
                                <RepoLink repo={row.repo} />
                            </td>
                            <td className={wideCellClass}>
                                {row.title}
                                <Tags tags={row.tags} />
                            </td>
                            <td className={`${timeCellClass} whitespace-nowrap`}>{formatAge(now - new Date(row.createdAt).getTime())}</td>
                            <td className={`${cellClass} whitespace-nowrap ${checks.className}`}>{checks.label}</td>
                            <td className={`${cellClass} whitespace-nowrap`}>
                                <span className="inline-flex gap-3">
                                    <ExternalLink href={row.url}>PR #{row.number}</ExternalLink>
                                    <ReleaseNotes sourceUrl={row.sourceUrl} fallback="Release notes in PR" />
                                </span>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
