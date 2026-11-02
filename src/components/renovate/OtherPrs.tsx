import type { PrRow } from '@/lib/model/types';
import { PrTable } from './PrTable';
import { EmptyText, NO_MATCH, Section, countText } from './ui';

export function OtherPrs({ rows, total, now }: { rows: PrRow[]; total: number; now: number }) {
    return (
        <Section id="other-prs" title="Other open PRs" count={countText(rows.length, total)}>
            {total === 0 ? (
                <EmptyText>No other open PRs.</EmptyText>
            ) : rows.length === 0 ? (
                <EmptyText>{NO_MATCH}</EmptyText>
            ) : (
                <PrTable rows={rows} now={now} />
            )}
        </Section>
    );
}
