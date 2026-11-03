import type { PrRow } from '@/lib/model/types';
import { PrTable } from './PrTable';
import { EmptyText, NO_MATCH, Section, countText } from './ui';

export function NeedsApproval({ rows, total, now }: { rows: PrRow[]; total: number; now: number }) {
    return (
        <Section id="needs-approval" title="Needs your approval" count={countText(rows.length, total)}>
            {total === 0 ? (
                <EmptyText>Nothing needs your approval.</EmptyText>
            ) : rows.length === 0 ? (
                <EmptyText>{NO_MATCH}</EmptyText>
            ) : (
                <PrTable rows={rows} now={now} />
            )}
        </Section>
    );
}
