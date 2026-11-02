import { Alert } from '@sjolystinnovation/app-kit/ui';
import type { LatestState } from '@/lib/db/store';
import { MAIN_BRANCH, type WorkflowRun } from '@/lib/model/types';
import { Board } from './Board';
import { Header } from './Header';
import { RunHistory } from './RunHistory';
import { Summary } from './Summary';
import { Warnings } from './Warnings';

export interface RenovateViewProps {
    /** Null when the database could not be read, which differs from a database with no data yet. */
    state: LatestState | null;
    runs: WorkflowRun[];
    now: Date;
}

const pageClass = 'mx-auto flex max-w-6xl flex-col gap-6 px-4 py-5';
const mainClass = 'flex flex-col gap-6';

export function RenovateView({ state, runs, now }: RenovateViewProps) {
    if (!state) {
        return (
            <div className={pageClass}>
                <Header latestRun={null} lastRefresh={null} />
                <main>
                    <Alert variant="error" role="alert">
                        The page cannot read the database.
                    </Alert>
                </main>
            </div>
        );
    }
    const model = state.model;
    return (
        <div className={pageClass}>
            <Header latestRun={runs.find((run) => run.headBranch === MAIN_BRANCH) ?? null} lastRefresh={state.lastSuccessAt} />
            <main className={mainClass}>
                <Warnings state={state} runs={runs} now={now} />
                {model ? (
                    <>
                        <Summary counts={model.counts} />
                        <Board
                            rows={{
                                needsApproval: model.needsApproval,
                                cooldown: model.cooldown,
                                waiting: model.waiting,
                                otherPrs: model.otherPrs,
                                problems: model.problems,
                            }}
                            now={now.getTime()}
                        />
                        <RunHistory runs={runs} />
                    </>
                ) : (
                    <p className="text-sm">{state.modelOutdated ? 'Waiting for the next refresh.' : 'No data yet. The first refresh has not finished.'}</p>
                )}
            </main>
        </div>
    );
}
