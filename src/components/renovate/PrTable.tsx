import type { ChecksState, PrRow } from '@/lib/model/types';
import { formatAge } from './format';
import { Cell, ExternalLink, ReleaseNotes, RepoLink, Row, Table, Tags } from './ui';

const CHECKS: Record<ChecksState, { label: string; className: string }> = {
    failing: { label: 'Failing', className: 'text-bad font-medium' },
    pending: { label: 'Pending', className: 'text-pending' },
    passing: { label: 'Passing', className: 'text-good' },
    none: { label: 'No checks', className: 'text-muted' },
};

export function PrTable({ rows, now }: { rows: PrRow[]; now: number }) {
    return (
        <Table names={['Repo', 'Title', 'Age', 'Checks', 'Links']}>
            {rows.map((row) => {
                const checks = CHECKS[row.checks] ?? CHECKS.none;
                return (
                    <Row key={`${row.repo}#${row.number}`}>
                        <Cell label="Repo" labelHidden kind="nowrap">
                            <RepoLink repo={row.repo} />
                        </Cell>
                        <Cell label="Title" labelHidden kind="wide">
                            {row.title}
                            <Tags tags={row.tags} />
                        </Cell>
                        <Cell label="Age" kind="time" className="whitespace-nowrap">
                            {formatAge(now - new Date(row.createdAt).getTime())}
                        </Cell>
                        <Cell label="Checks" kind="nowrap">
                            <span className={checks.className}>{checks.label}</span>
                        </Cell>
                        <Cell label="Links" labelHidden kind="nowrap">
                            <span className="inline-flex gap-3">
                                <ExternalLink href={row.url}>PR #{row.number}</ExternalLink>
                                <ReleaseNotes sourceUrl={row.sourceUrl} fallback="Release notes in PR" />
                            </span>
                        </Cell>
                    </Row>
                );
            })}
        </Table>
    );
}
