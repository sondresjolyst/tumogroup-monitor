import type { Tag, UpdateRow } from '@/lib/model/types';
import { formatOslo, formatTimeLeft } from './format';
import { UpdateLinks } from './UpdateLinks';
import { Cell, EmptyText, NO_MATCH, RepoLink, Row, Section, Table, Tags } from './ui';

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

interface CooldownGroup {
    key: string;
    rows: UpdateRow[];
    repos: number;
    tags: Tag[];
}

/**
 * One group per update that reads the same in every repo. The dates are part of the key, because a
 * group row shows one cooldown end and one expected PR, and those must hold for every repo in it.
 */
function groupRows(rows: UpdateRow[]): CooldownGroup[] {
    const groups = Map.groupBy(rows, (row) => [row.dep, row.newVersion, row.cooldownEnd, row.expectedPr].join('\n'));
    return [...groups]
        .map(([key, members]) => {
            const found = new Set(members.flatMap((row) => row.tags));
            return {
                key,
                rows: members,
                repos: new Set(members.map((row) => row.repo)).size,
                tags: (['Major', 'No release date'] as const).filter((tag) => found.has(tag)),
            };
        })
        .sort((a, b) => (a.rows[0].cooldownEnd ?? '').localeCompare(b.rows[0].cooldownEnd ?? '') || a.rows[0].dep.localeCompare(b.rows[0].dep));
}

function countText(groups: CooldownGroup[], shown: number, total: number): string {
    const rows = groups.length;
    const repos = new Set(groups.flatMap((group) => group.rows.map((row) => row.repo))).size;
    const parts = [`${rows} rows`];
    if (shown !== rows) parts.push(`${shown} updates`);
    if (repos !== rows) parts.push(`${repos} repos`);
    const text = parts.length === 1 ? String(rows) : parts.join(', ');
    return shown === total ? text : `${text} of ${total} updates`;
}

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

function UpdateName({ row }: { row: UpdateRow }) {
    return (
        <>
            {row.dep} to {row.newVersion}
        </>
    );
}

function GroupRow({ group, now, filtering }: { group: CooldownGroup; now: number; filtering: boolean }) {
    const first = group.rows[0];
    const single = group.rows.length === 1;
    return (
        <Row>
            <Cell label="Repo" labelHidden kind="nowrap">
                {single ? <RepoLink repo={first.repo} /> : `${group.repos} ${group.repos === 1 ? 'repo' : 'repos'}`}
            </Cell>
            <Cell label="Update" labelHidden kind="wide">
                {single ? (
                    <>
                        <UpdateName row={first} />
                        <Tags tags={group.tags} />
                    </>
                ) : (
                    <details key={filtering ? 'filtered' : 'all'} open={filtering}>
                        <summary className="cursor-pointer">
                            <UpdateName row={first} />
                            <Tags tags={group.tags} />
                        </summary>
                        <ul className="mt-1">
                            {group.rows.map((row) => (
                                <li key={`${row.repo}\n${row.branch}`} className="flex flex-wrap justify-between gap-x-4 border-t border-line py-1">
                                    <RepoLink repo={row.repo} />
                                    <UpdateLinks row={row} />
                                </li>
                            ))}
                        </ul>
                    </details>
                )}
            </Cell>
            <Cell label="Cooldown" labelHidden kind="time">
                <Progress row={first} now={now} />
            </Cell>
            <Cell label="PR" labelHidden kind="time" className="whitespace-nowrap">
                Expected {formatOslo(first.expectedPr)}
            </Cell>
            <Cell label="Links" labelHidden kind="nowrap">
                {single && <UpdateLinks row={first} />}
            </Cell>
        </Row>
    );
}

export function Cooldown({ rows, total, now, filtering }: { rows: UpdateRow[]; total: number; now: number; filtering: boolean }) {
    const groups = groupRows(rows);
    return (
        <Section id="cooldown" title="In cooldown" count={countText(groups, rows.length, total)}>
            {total === 0 ? (
                <EmptyText>Nothing is in cooldown.</EmptyText>
            ) : rows.length === 0 ? (
                <EmptyText>{NO_MATCH}</EmptyText>
            ) : (
                <Table names={['Repo', 'Update', 'Cooldown', 'PR', 'Links']}>
                    {groups.map((group) => (
                        <GroupRow key={group.key} group={group} now={now} filtering={filtering} />
                    ))}
                </Table>
            )}
        </Section>
    );
}
