import type { Counts } from '@/lib/model/types';

function Count({ value, label, target }: { value: number; label: string; target?: string }) {
    const content = (
        <>
            <b className="block text-xl font-semibold tabular-nums">{value}</b>
            <span className="text-xs text-muted">{label}</span>
        </>
    );
    return <li>{target ? <a href={`#${target}`} className="block hover:underline">{content}</a> : content}</li>;
}

export function Summary({ counts }: { counts: Counts }) {
    return (
        <ul aria-label="Summary" className="grid grid-cols-3 gap-x-4 gap-y-3 md:grid-cols-6">
            <Count value={counts.needsApproval} label="Needs your approval" target="needs-approval" />
            <Count value={counts.cooldown} label="In cooldown" target="cooldown" />
            <Count value={counts.waiting} label="Waiting for Sunday" target="waiting" />
            <Count value={counts.otherPrs} label="Other open PRs" target="other-prs" />
            <Count value={counts.noReleaseDate} label="No release date" />
            <Count value={counts.problems} label="Problems" target="problems" />
        </ul>
    );
}
