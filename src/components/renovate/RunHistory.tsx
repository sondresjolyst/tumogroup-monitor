import { CONFIG_REPO_URL } from '@/lib/github/client';
import { runRows } from '@/lib/model/build';
import type { WorkflowRun } from '@/lib/model/types';
import { formatDuration, formatOslo } from './format';
import {
    EmptyText,
    ExternalLink,
    Section,
    bodyClass,
    cellClass,
    headCellClass,
    headClass,
    rowClass,
    tableClass,
    timeCellClass,
} from './ui';

const SHOWN_RUNS = 20;

/** The column name, for the phone layout, where the table has no header row. */
function PhoneLabel({ children }: { children: string }) {
    return <span className="text-muted md:hidden">{children} </span>;
}

export function RunHistory({ runs }: { runs: WorkflowRun[] }) {
    const rows = runRows(runs).slice(0, SHOWN_RUNS);
    return (
        <Section id="runs" title="Run history" count={rows.length}>
            {rows.length === 0 ? (
                <EmptyText>No runs recorded.</EmptyText>
            ) : (
                <table className={tableClass}>
                    <thead className={headClass}>
                        <tr>
                            {['Planned', 'Started', 'Late', 'Duration', 'Conclusion', 'Event'].map((name) => (
                                <th key={name} scope="col" className={headCellClass}>
                                    {name}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className={bodyClass}>
                        {rows.map((row) => (
                            <tr key={row.id} className={rowClass}>
                                <td className={timeCellClass}>
                                    {row.plannedSlot ? (
                                        <>
                                            <PhoneLabel>Planned</PhoneLabel>
                                            {formatOslo(row.plannedSlot)}
                                        </>
                                    ) : (
                                        'Not planned'
                                    )}
                                </td>
                                <td className={timeCellClass}>
                                    <PhoneLabel>Started</PhoneLabel>
                                    {formatOslo(row.startedAt)}
                                </td>
                                <td className={timeCellClass}>
                                    {row.plannedSlot && (
                                        <>
                                            <PhoneLabel>Late</PhoneLabel>
                                            {formatDuration(new Date(row.startedAt).getTime() - new Date(row.plannedSlot).getTime())}
                                        </>
                                    )}
                                </td>
                                <td className={timeCellClass}>
                                    <PhoneLabel>Duration</PhoneLabel>
                                    {formatDuration(row.durationMs)}
                                </td>
                                <td className={cellClass}>
                                    <ExternalLink href={`${CONFIG_REPO_URL}/actions/runs/${row.id}`}>{row.conclusion ?? 'in progress'}</ExternalLink>
                                </td>
                                <td className={cellClass}>{row.event}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Section>
    );
}
