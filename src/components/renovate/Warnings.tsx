import { Alert } from '@sjolystinnovation/app-kit/ui';
import type { LatestState } from '@/lib/db/store';
import type { WorkflowRun } from '@/lib/model/types';
import { formatAge, formatOslo } from './format';

/** A daily run was already seen starting over 7 hours late, so a limit near 24 hours would cry wolf. */
const REPORT_STALE_AFTER_MS = 32 * 60 * 60 * 1000;
/** The refresh runs every 15 minutes. A killed or suspended job saves no failure, so this age is the only sign of it. */
const REFRESH_STALE_AFTER_MS = 60 * 60 * 1000;

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

function refreshText(state: LatestState, now: Date): string | null {
    // A saved failure already states the age of the data.
    if (!state.lastSuccessAt || state.lastError) return null;
    const age = now.getTime() - state.lastSuccessAt.getTime();
    if (age <= REFRESH_STALE_AFTER_MS) return null;
    return `The data is ${formatAge(age)} old. The refresh runs every 15 minutes, so the job may have stopped.`;
}

/** The refresh can succeed on the same old report, so the age of the report counts on its own. */
function reportText(state: LatestState, runs: WorkflowRun[], now: Date): string | null {
    const reportRun = runs.find((run) => run.id === state.reportRunId);
    if (!reportRun) return null;
    const reportAge = now.getTime() - new Date(reportRun.startedAt).getTime();
    return reportAge > REPORT_STALE_AFTER_MS ? `The Renovate report is ${formatAge(reportAge)} old.` : null;
}

function pageWarnings(state: LatestState, runs: WorkflowRun[], now: Date): PageWarning[] {
    const warnings: PageWarning[] = [];
    if (state.lastError) warnings.push({ variant: 'error', text: failureText(state, now) });
    for (const text of [refreshText(state, now), state.model ? reportText(state, runs, now) : null]) {
        if (text) warnings.push({ variant: 'warning', text });
    }
    for (const warning of state.model?.warnings ?? []) warnings.push({ variant: 'warning', text: warning.message });
    return warnings;
}

export function Warnings({ state, runs, now }: { state: LatestState; runs: WorkflowRun[]; now: Date }) {
    const warnings = pageWarnings(state, runs, now);
    if (warnings.length === 0) return null;
    return (
        <div className="flex flex-col gap-2">
            {warnings.map((warning) => (
                <Alert key={warning.text} variant={warning.variant} role={warning.variant === 'error' ? 'alert' : 'status'}>
                    {warning.text}
                </Alert>
            ))}
        </div>
    );
}
