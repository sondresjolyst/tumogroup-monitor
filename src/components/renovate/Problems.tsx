import type { ProblemKind, ProblemRow } from '@/lib/model/types';
import { Cell, EmptyText, LongText, NO_MATCH, RepoLink, Row, Section, Table, countText } from './ui';

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
                <Table names={['Kind', 'Repo', 'Package', 'Details']}>
                    {rows.map((row, index) => (
                        <Row key={index}>
                            <Cell label="Kind" labelHidden kind="nowrap">
                                {KINDS[row.kind] ?? row.kind}
                            </Cell>
                            <Cell label="Repo" labelHidden kind="nowrap">
                                {row.repo && <RepoLink repo={row.repo} />}
                            </Cell>
                            <Cell label="Package" labelHidden className="[overflow-wrap:anywhere]">
                                {row.subject}
                            </Cell>
                            <Cell label="Details" labelHidden kind="wide">
                                <LongText text={row.message} />
                            </Cell>
                        </Row>
                    ))}
                </Table>
            )}
        </Section>
    );
}
