import type { Tag, UpdateRow } from '@/lib/model/types';
import { formatOslo } from './format';
import { DashboardLink } from './UpdateLinks';
import {
    EmptyText,
    NO_MATCH,
    ReleaseNotes,
    RepoLink,
    Section,
    Tags,
    bodyClass,
    cellClass,
    countText,
    rowClass,
    tableClass,
    wideCellClass,
} from './ui';

const count = (value: number, word: string) => `${value} ${word}${value === 1 ? '' : 'es'}`;
const updates = (value: number) => `${value} update${value === 1 ? '' : 's'}`;

function groupRows(rows: UpdateRow[]): UpdateRow[][] {
    return [...Map.groupBy(rows, (row) => `${row.repo}\n${row.branch}`).values()];
}

function groupTags(rows: UpdateRow[]): Tag[] {
    const found = new Set(rows.flatMap((row) => row.tags));
    return (['Major', 'No release date'] as const).filter((tag) => found.has(tag));
}

function Group({ rows, open }: { rows: UpdateRow[]; open: boolean }) {
    const first = rows[0];
    return (
        <details open={open} className="border-b border-line">
            <summary className="cursor-pointer py-1.5 text-sm">
                <span className="[overflow-wrap:anywhere] [&>*]:mr-3">
                    <span>
                        <RepoLink repo={first.repo} />
                    </span>
                    <span>{first.branch}</span>
                    <span className="text-muted tabular-nums">{updates(rows.length)}</span>
                    <span className="tabular-nums">Expected {formatOslo(first.expectedPr)}</span>
                    <span>
                        <DashboardLink repo={first.repo} issue={first.dashboardIssue} />
                    </span>
                    <span className="-ml-1.5">
                        <Tags tags={groupTags(rows)} />
                    </span>
                </span>
            </summary>
            <table className={`${tableClass} mb-2`}>
                <tbody className={bodyClass}>
                    {rows.map((row) => (
                        <tr key={`${row.dep}\n${row.newVersion}`} className={rowClass}>
                            <td className={`${wideCellClass} md:pl-4`}>
                                {row.dep} to {row.newVersion}
                                <Tags tags={row.tags} />
                            </td>
                            <td className={`${cellClass} whitespace-nowrap md:w-40`}>
                                <ReleaseNotes sourceUrl={row.sourceUrl} fallback="No release notes" />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </details>
    );
}

/**
 * This section can hold hundreds of rows, so it stays one line until opened, and the sections after
 * it stay close. An active filter opens everything, so its matches are in view. The key puts the
 * groups back to their default state when the filter changes between on and off.
 */
export function WaitingForSunday({ rows, total, filtering }: { rows: UpdateRow[]; total: number; filtering: boolean }) {
    const groups = groupRows(rows);
    const earliest = rows.map((row) => row.expectedPr).sort()[0];
    return (
        <Section id="waiting" title="Waiting for Sunday" count={countText(rows.length, total)}>
            {total === 0 ? (
                <EmptyText>Nothing is waiting for Sunday.</EmptyText>
            ) : rows.length === 0 ? (
                <EmptyText>{NO_MATCH}</EmptyText>
            ) : (
                <details key={filtering ? 'filtered' : 'all'} open={filtering} className="border-b border-line">
                    <summary className="cursor-pointer py-1.5 text-sm">
                        <span className="tabular-nums [&>*]:mr-3">
                            <span>
                                {updates(rows.length)} in {count(groups.length, 'branch')}
                            </span>
                            <span>Expected {formatOslo(earliest)}</span>
                        </span>
                    </summary>
                    <div className="border-t border-line pl-4 max-md:pl-2">
                        {groups.map((group) => (
                            <Group key={`${group[0].repo}\n${group[0].branch}`} rows={group} open={filtering} />
                        ))}
                    </div>
                </details>
            )}
        </Section>
    );
}
