'use client';

import { TextInput } from '@sjolystinnovation/app-kit/ui';
import { useId } from 'react';
import type { FilterState } from './filter';
import { repoName } from './ui';

export function Filters({ repos, filter, onChange }: { repos: string[]; filter: FilterState; onChange: (filter: FilterState) => void }) {
    const repoId = useId();
    return (
        <form role="search" className="flex flex-wrap items-end gap-x-4 gap-y-2" onSubmit={(event) => event.preventDefault()}>
            <div>
                <label htmlFor={repoId} className="mb-field-label block text-field-label font-medium text-field-label-text">
                    Repo
                </label>
                <select
                    id={repoId}
                    value={filter.repo}
                    onChange={(event) => onChange({ ...filter, repo: event.target.value })}
                    className="w-full max-w-60 rounded-input border border-input-border bg-background px-3 py-input-y text-sm text-input-text"
                >
                    <option value="">All repos</option>
                    {repos.map((repo) => (
                        <option key={repo} value={repo}>
                            {repoName(repo)}
                        </option>
                    ))}
                </select>
            </div>
            <TextInput
                label="Text"
                type="search"
                className="min-w-48 flex-1"
                value={filter.text}
                onChange={(event) => onChange({ ...filter, text: event.target.value })}
            />
            <label className="flex items-center gap-2 py-input-y text-sm">
                <input
                    type="checkbox"
                    checked={filter.noReleaseDate}
                    onChange={(event) => onChange({ ...filter, noReleaseDate: event.target.checked })}
                    className="accent-primary"
                />
                No release date
            </label>
        </form>
    );
}
