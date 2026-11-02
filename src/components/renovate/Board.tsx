'use client';

import { useMemo, useState } from 'react';
import type { PageModel } from '@/lib/model/types';
import { Cooldown } from './Cooldown';
import { NO_FILTER, isFiltering, matchesPr, matchesProblem, matchesUpdate } from './filter';
import { Filters } from './Filters';
import { NeedsApproval } from './NeedsApproval';
import { OtherPrs } from './OtherPrs';
import { Problems } from './Problems';
import { WaitingForSunday } from './WaitingForSunday';

export type BoardRows = Pick<PageModel, 'needsApproval' | 'cooldown' | 'waiting' | 'otherPrs' | 'problems'>;

function repoList({ needsApproval, cooldown, waiting, otherPrs, problems }: BoardRows): string[] {
    const repos = new Set<string>();
    for (const list of [needsApproval, cooldown, waiting, otherPrs, problems]) {
        for (const row of list) if (row.repo) repos.add(row.repo);
    }
    return [...repos].sort((a, b) => a.localeCompare(b));
}

/** The sections a filter can narrow. `now` comes from the server, so both sides render the same ages. */
export function Board({ rows, now }: { rows: BoardRows; now: number }) {
    const [filter, setFilter] = useState(NO_FILTER);
    const repos = useMemo(() => repoList(rows), [rows]);
    return (
        <>
            <Filters repos={repos} filter={filter} onChange={setFilter} />
            <NeedsApproval rows={rows.needsApproval.filter((row) => matchesPr(filter, row))} total={rows.needsApproval.length} now={now} />
            <Cooldown rows={rows.cooldown.filter((row) => matchesUpdate(filter, row))} total={rows.cooldown.length} now={now} />
            <WaitingForSunday rows={rows.waiting.filter((row) => matchesUpdate(filter, row))} total={rows.waiting.length} filtering={isFiltering(filter)} />
            <OtherPrs rows={rows.otherPrs.filter((row) => matchesPr(filter, row))} total={rows.otherPrs.length} now={now} />
            <Problems rows={rows.problems.filter((row) => matchesProblem(filter, row))} total={rows.problems.length} />
        </>
    );
}
