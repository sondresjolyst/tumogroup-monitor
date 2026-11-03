import { CONFIG_REPO_URL } from '@/lib/github/client';
import { runRows } from '@/lib/model/build';
import { MAIN_BRANCH, type WorkflowRun } from '@/lib/model/types';
import { formatDuration, formatOslo, formatOsloTime } from './format';
import { Cell, EmptyText, ExternalLink, Row, Section, Table } from './ui';

const SHOWN_RUNS = 20;

export function RunHistory({ runs }: { runs: WorkflowRun[] }) {
    const rows = runRows(runs).slice(0, SHOWN_RUNS);
    return (
        <Section id="runs" title="Run history" count={rows.length}>
            {rows.length === 0 ? (
                <EmptyText>No runs recorded.</EmptyText>
            ) : (
                <Table names={['Planned', 'Started', 'Late since', 'Duration', 'Conclusion', 'Event']}>
                    {rows.map((row) => (
                        <Row key={row.id}>
                            <Cell label={row.plannedSlot ? 'Planned' : undefined} kind="time">
                                {row.plannedSlot ? formatOslo(row.plannedSlot) : 'Not planned'}
                            </Cell>
                            <Cell label="Started" kind="time">
                                {formatOslo(row.startedAt)}
                            </Cell>
                            <Cell label={row.plannedSlot ? 'Late since' : undefined} kind="time">
                                {row.plannedSlot &&
                                    `${formatOsloTime(row.plannedSlot)}, ${formatDuration(new Date(row.startedAt).getTime() - new Date(row.plannedSlot).getTime())}`}
                            </Cell>
                            <Cell label="Duration" kind="time">
                                {formatDuration(row.durationMs)}
                            </Cell>
                            <Cell label="Conclusion" labelHidden>
                                <ExternalLink href={`${CONFIG_REPO_URL}/actions/runs/${row.id}`}>{row.conclusion ?? 'in progress'}</ExternalLink>
                            </Cell>
                            <Cell label="Event" labelHidden>
                                {row.event}
                                {row.headBranch && row.headBranch !== MAIN_BRANCH && ` on ${row.headBranch}`}
                            </Cell>
                        </Row>
                    ))}
                </Table>
            )}
        </Section>
    );
}
