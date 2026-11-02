import type { ProblemKind, ProblemRow } from '@/lib/model/types';
import {
    EmptyText,
    LongText,
    NO_MATCH,
    RepoLink,
    Section,
    bodyClass,
    cellClass,
    countText,
    headCellClass,
    headClass,
    rowClass,
    tableClass,
    wideCellClass,
} from './ui';

const KINDS: Record<ProblemKind, string> = {
    abandoned: 'Abandoned',
    deprecated: 'Deprecated',
    repo: 'Renovate problem',
    disabled: 'Disabled',
    report: 'Report problem',
};

export function Problems({ rows, total }: { rows: ProblemRow[]; total: number }) {
    return (
        <Section id="problems" title="Problems" count={countText(rows.length, total)}>
            {total === 0 ? (
                <EmptyText>No problems.</EmptyText>
            ) : rows.length === 0 ? (
                <EmptyText>{NO_MATCH}</EmptyText>
            ) : (
                <table className={tableClass}>
                    <thead className={headClass}>
                        <tr>
                            {['Kind', 'Repo', 'Package', 'Details'].map((name) => (
                                <th key={name} scope="col" className={headCellClass}>
                                    {name}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className={bodyClass}>
                        {rows.map((row, index) => (
                            <tr key={index} className={rowClass}>
                                <td className={`${cellClass} whitespace-nowrap`}>{KINDS[row.kind] ?? row.kind}</td>
                                <td className={`${cellClass} whitespace-nowrap`}>{row.repo && <RepoLink repo={row.repo} />}</td>
                                <td className={`${cellClass} [overflow-wrap:anywhere]`}>{row.subject}</td>
                                <td className={wideCellClass}>
                                    <LongText text={row.message} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Section>
    );
}
