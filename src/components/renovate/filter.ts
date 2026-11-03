import type { PrRow, ProblemRow, UpdateRow } from '@/lib/model/types';

export interface FilterState {
    repo: string;
    text: string;
    noReleaseDate: boolean;
}

export const NO_FILTER: FilterState = { repo: '', text: '', noReleaseDate: false };

export function isFiltering(filter: FilterState): boolean {
    return filter.repo !== '' || filter.text.trim() !== '' || filter.noReleaseDate;
}

function matches(filter: FilterState, repo: string | null, hasNoDate: boolean, fields: (string | null)[]): boolean {
    if (filter.repo && repo !== filter.repo) return false;
    if (filter.noReleaseDate && !hasNoDate) return false;
    const text = filter.text.trim().toLowerCase();
    return !text || fields.some((field) => field?.toLowerCase().includes(text));
}

export const matchesPr = (filter: FilterState, row: PrRow) =>
    matches(filter, row.repo, row.tags.includes('No release date'), [row.repo, row.title, row.branch, String(row.number)]);

export const matchesUpdate = (filter: FilterState, row: UpdateRow) =>
    matches(filter, row.repo, row.tags.includes('No release date'), [row.repo, row.dep, row.newVersion, row.branch]);

/** The section shows no branch, so a branch name must not match here. */
export const matchesCooldown = (filter: FilterState, row: UpdateRow) =>
    matches(filter, row.repo, row.tags.includes('No release date'), [row.repo, row.dep, row.newVersion]);

export const matchesProblem = (filter: FilterState, row: ProblemRow) =>
    matches(filter, row.repo, false, [row.repo, row.subject, row.message, row.kind]);
