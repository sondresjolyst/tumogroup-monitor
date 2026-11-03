import type { Counts } from '@/lib/model/types';

function Count({ value, label, target }: { value: number; label: string; target: string }) {
    return (
        <li>
            <a href={`#${target}`} className="block hover:underline">
                <b className="block text-xl font-semibold tabular-nums">{value}</b>
                <span className="text-xs text-muted">{label}</span>
            </a>
        </li>
    );
}

/** The tiles do not overlap. "No release date" cuts across them, so it reads as a subset below. */
export function Summary({ counts }: { counts: Counts }) {
    return (
        <div>
            <ul aria-label="Summary" className="grid grid-cols-3 gap-x-4 gap-y-3 md:grid-cols-5">
                <Count value={counts.needsApproval} label="Needs your approval" target="needs-approval" />
                <Count value={counts.cooldown} label="In cooldown" target="cooldown" />
                <Count value={counts.waiting} label="Waiting for Sunday" target="waiting" />
                <Count value={counts.otherPrs} label="Other open PRs" target="other-prs" />
                <Count value={counts.problems} label="Problems" target="problems" />
            </ul>
            <p className="mt-2 text-xs text-muted">
                Of the open PRs and waiting updates, {counts.noReleaseDate} {counts.noReleaseDate === 1 ? 'has' : 'have'} no release date.
            </p>
        </div>
    );
}
