import type { UpdateRow } from '@/lib/model/types';
import { formatOslo, formatTimeLeft } from './format';
import { UpdateLinks } from './UpdateLinks';
import {
    EmptyText,
    NO_MATCH,
    RepoLink,
    Section,
    Tags,
    bodyClass,
    cellClass,
    countText,
    headCellClass,
    headClass,
    rowClass,
    tableClass,
    timeCellClass,
    wideCellClass,
} from './ui';

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function Progress({ row, now }: { row: UpdateRow; now: number }) {
    const left = row.cooldownEnd ? new Date(row.cooldownEnd).getTime() - now : 0;
    const done = Math.round(Math.min(1, Math.max(0, 1 - left / COOLDOWN_MS)) * 100);
    return (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <span role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={100} aria-label="Cooldown" className="inline-block h-1.5 w-[70px] rounded-sm bg-line">
                <span className="block h-1.5 rounded-sm bg-primary" style={{ width: `${done}%` }} />
            </span>
            {formatTimeLeft(left)}
        </span>
    );
}

export function Cooldown({ rows, total, now }: { rows: UpdateRow[]; total: number; now: number }) {
    return (
        <Section id="cooldown" title="In cooldown" count={countText(rows.length, total)}>
            {total === 0 ? (
                <EmptyText>Nothing is in cooldown.</EmptyText>
            ) : rows.length === 0 ? (
                <EmptyText>{NO_MATCH}</EmptyText>
            ) : (
                <table className={tableClass}>
                    <thead className={headClass}>
                        <tr>
                            {['Repo', 'Update', 'Cooldown', 'PR', 'Links'].map((name) => (
                                <th key={name} scope="col" className={headCellClass}>
                                    {name}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className={bodyClass}>
                        {rows.map((row) => (
                            <tr key={`${row.repo}\n${row.branch}\n${row.dep}\n${row.newVersion}`} className={rowClass}>
                                <td className={`${cellClass} whitespace-nowrap`}>
                                    <RepoLink repo={row.repo} />
                                </td>
                                <td className={wideCellClass}>
                                    {row.dep} to {row.newVersion}
                                    <Tags tags={row.tags} />
                                </td>
                                <td className={timeCellClass}>
                                    <Progress row={row} now={now} />
                                </td>
                                <td className={`${timeCellClass} whitespace-nowrap`}>Expected {formatOslo(row.expectedPr)}</td>
                                <td className={`${cellClass} whitespace-nowrap`}>
                                    <UpdateLinks row={row} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Section>
    );
}
