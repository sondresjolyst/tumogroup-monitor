import { Alert } from '@sjolystinnovation/app-kit/ui';
import type { LatestState } from '@/lib/db/store';
import type { WorkflowRun } from '@/lib/model/types';
import { formatAge, formatOslo } from './format';

/** A daily run was already seen starting over 7 hours late, so a limit near 24 hours would cry wolf. */
const STALE_AFTER_MS = 32 * 60 * 60 * 1000;

interface PageWarning {
    variant: 'error' | 'warning';
    text: string;
}

function failureText(state: LatestState, now: Date): string {
    const base = `The last refresh failed. ${state.lastError}`;
    if (!state.lastSuccessAt) return base;
    const age = formatAge(now.getTime() - state.lastSuccessAt.getTime());
    return `${base} The data shown is from ${formatOslo(state.lastSuccessAt)}, ${age} old.`;
}

/**
 * The refresh runs every 15 minutes and can succeed on the same old report, so the age of the
 * report counts as well as the time of the last refresh.
 */
function staleText(state: LatestState, runs: WorkflowRun[], now: Date): string | null {
    const dataAge = state.lastSuccessAt ? now.getTime() - state.lastSuccessAt.getTime() : null;
    if (dataAge !== null && dataAge > STALE_AFTER_MS) return `The data is ${formatAge(dataAge)} old.`;
    const reportRun = runs.find((run) => run.id === state.reportRunId);
    if (!reportRun) return null;
    const reportAge = now.getTime() - new Date(reportRun.startedAt).getTime();
    return reportAge > STALE_AFTER_MS ? `The Renovate report is ${formatAge(reportAge)} old.` : null;
}

function pageWarnings(state: LatestState, runs: WorkflowRun[], now: Date): PageWarning[] {
    const warnings: PageWarning[] = [];
    if (state.lastError) warnings.push({ variant: 'error', text: failureText(state, now) });
    const stale = state.model ? staleText(state, runs, now) : null;
    if (stale) warnings.push({ variant: 'warning', text: stale });
    for (const warning of state.model?.warnings ?? []) warnings.push({ variant: 'warning', text: warning.message });
    return warnings;
}

export function Warnings({ state, runs, now }: { state: LatestState; runs: WorkflowRun[]; now: Date }) {
    const warnings = pageWarnings(state, runs, now);
    if (warnings.length === 0) return null;
    return (
        <div className="flex flex-col gap-2">
            {warnings.map((warning) => (
                <Alert key={warning.text} variant={warning.variant} role="status">
                    {warning.text}
                </Alert>
            ))}
        </div>
    );
}
