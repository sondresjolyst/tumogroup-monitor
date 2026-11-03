import { SignOutButton } from '@/components/auth/SignOutButton';
import type { WorkflowRun } from '@/lib/model/types';
import { formatOslo } from './format';

export function Header({ latestRun, lastRefresh }: { latestRun: WorkflowRun | null; lastRefresh: Date | null }) {
    return (
        <header className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4">
                <h1 className="text-xl font-semibold">Renovate</h1>
                <SignOutButton />
            </div>
            <p className="flex flex-wrap gap-x-5 text-sm text-muted tabular-nums">
                <span>
                    Last run{' '}
                    {latestRun ? (
                        <span className="text-foreground">
                            {formatOslo(latestRun.startedAt)}, {latestRun.conclusion ?? 'in progress'}
                        </span>
                    ) : (
                        'none recorded'
                    )}
                </span>
                <span>
                    Last refresh {lastRefresh ? <span className="text-foreground">{formatOslo(lastRefresh)}</span> : 'none yet'}
                </span>
            </p>
        </header>
    );
}
