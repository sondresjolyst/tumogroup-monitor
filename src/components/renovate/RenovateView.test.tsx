// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RenovateView, type RenovateViewProps } from './RenovateView';
import { NOW, hoursAgo, model, pr, problem, state, update, workflowRun } from './test-state';

const SECTIONS = ['Needs your approval', 'In cooldown', 'Waiting for Sunday', 'Other open PRs', 'Problems', 'Run history'];

const show = (props: Partial<RenovateViewProps> = {}) =>
    render(<RenovateView state={state()} runs={[]} now={NOW} {...props} />);

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.firstChild?.textContent);

const section = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) });

const hrefs = (scope: HTMLElement) => within(scope).queryAllByRole('link').map((link) => link.getAttribute('href'));

const headers = (scope: HTMLElement) => within(scope).getAllByRole('columnheader').map((cell) => cell.textContent);

const fullModel = () =>
    model({
        counts: { needsApproval: 2, cooldown: 2, waiting: 3, otherPrs: 1, noReleaseDate: 1, problems: 2 },
        needsApproval: [
            pr({ tags: ['Major'] }),
            pr({ repo: 'example-org/app-two', number: 22, title: 'Update lodash to v5', url: 'https://github.com/example-org/app-two/pull/22', sourceUrl: null, checks: 'failing' }),
        ],
        cooldown: [
            update({ tags: ['Major'] }),
            update({ repo: 'example-org/app-two', dep: 'eslint', newVersion: '10.0.1', branch: 'renovate/eslint', dashboardIssue: 7 }),
        ],
        waiting: [
            update({ dep: 'rxjs', newVersion: '7.8.2', branch: 'renovate/pin-dependencies', cooldownEnd: null, daysLeft: null, releaseTimestamp: null }),
            update({ dep: 'vitest', newVersion: '5.0.5', branch: 'renovate/pin-dependencies', cooldownEnd: null, daysLeft: null }),
            update({ repo: 'example-org/app-two', dep: 'node', newVersion: '26.1.0', branch: 'renovate/docker-node', tags: ['No release date'], cooldownEnd: null, daysLeft: null, dashboardIssue: 7 }),
        ],
        otherPrs: [pr({ repo: 'example-org/app-two', number: 33, title: 'Update Serilog to v4', url: 'https://github.com/example-org/app-two/pull/33', checks: 'pending' })],
        problems: [
            problem(),
            problem({ kind: 'repo', repo: 'example-org/app-two', subject: null, message: 'The lockfile cannot be read.' }),
        ],
    });

describe('RenovateView', () => {
    it('header shows last run, conclusion and last refresh in Oslo time', () => {
        show({
            state: state({ lastSuccessAt: new Date('2026-11-02T16:45:00Z') }),
            runs: [workflowRun()],
        });
        const banner = screen.getByRole('banner');
        expect(banner.textContent).toContain('Last run');
        expect(banner.textContent).toContain('Mon 2 Nov 03:20');
        expect(banner.textContent).toContain('success');
        expect(banner.textContent).toContain('Last refresh');
        expect(banner.textContent).toContain('Mon 2 Nov 17:45');
    });

    it('header says a run is still going when it has no conclusion', () => {
        show({ runs: [workflowRun({ conclusion: null })] });
        expect(screen.getByRole('banner').textContent).toContain('in progress');
    });

    it('no model shows "No data yet", not an empty list', () => {
        show({ state: state({ model: null, lastSuccessAt: null }) });
        expect(screen.getByText('No data yet')).toBeTruthy();
        expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
        expect(screen.queryByText(/nothing/i)).toBeNull();
    });

    it('no model with a failure shows the failure too', () => {
        show({ state: state({ model: null, lastSuccessAt: null, lastError: 'The Renovate report has an unexpected format at repositories.', lastErrorAt: hoursAgo(1) }) });
        expect(screen.getByText('No data yet')).toBeTruthy();
        expect(screen.getByRole('status').textContent).toContain('The Renovate report has an unexpected format at repositories.');
    });

    it('a database failure says so, and does not read as no data', () => {
        show({ state: null });
        expect(screen.getByText('The page cannot read the database.')).toBeTruthy();
        expect(screen.queryByText('No data yet')).toBeNull();
    });

    it('model with lastError shows the failure, the data age, and keeps all sections', () => {
        show({
            state: state({
                model: fullModel(),
                lastSuccessAt: hoursAgo(3),
                lastError: 'No Renovate report artifact was found in the recent workflow runs.',
                lastErrorAt: hoursAgo(1),
            }),
        });
        const warning = screen.getByRole('status');
        expect(warning.textContent).toContain('No Renovate report artifact was found');
        expect(warning.textContent).toContain('3 hours');
        expect(headings()).toEqual(SECTIONS);
        expect(screen.getByText('Update vite to v9')).toBeTruthy();
    });

    it('data older than 32 hours shows a warning, and 31 hours does not', () => {
        const { unmount } = show({ state: state({ lastSuccessAt: hoursAgo(32.1) }) });
        expect(screen.getByRole('status').textContent).toContain('The data is 32 hours old.');
        unmount();
        show({ state: state({ lastSuccessAt: hoursAgo(31) }) });
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('a report older than 32 hours warns even when the refresh is recent', () => {
        const oldRun = workflowRun({ id: 77, startedAt: hoursAgo(33).toISOString(), updatedAt: hoursAgo(33).toISOString() });
        const newRun = workflowRun({ id: 78, startedAt: hoursAgo(2).toISOString(), updatedAt: hoursAgo(2).toISOString() });
        const { unmount } = show({ state: state({ reportRunId: 77 }), runs: [newRun, oldRun] });
        expect(screen.getByRole('status').textContent).toContain('The Renovate report is 33 hours old.');
        unmount();
        show({ state: state({ reportRunId: 78 }), runs: [newRun, oldRun] });
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('shows the warnings from the model', () => {
        show({ state: state({ model: model({ warnings: [{ kind: 'no-sunday-run', message: 'No scheduled run started on Sunday 1 Nov 2026.' }] }) }) });
        expect(screen.getByRole('status').textContent).toBe('No scheduled run started on Sunday 1 Nov 2026.');
    });

    it('empty section says it has nothing waiting', () => {
        show();
        expect(headings()).toEqual(SECTIONS);
        expect(section('Needs your approval').textContent).toContain('Nothing needs your approval.');
        expect(section('In cooldown').textContent).toContain('Nothing is in cooldown.');
        expect(section('Waiting for Sunday').textContent).toContain('Nothing is waiting for Sunday.');
        expect(section('Other open PRs').textContent).toContain('No other open PRs.');
        expect(section('Problems').textContent).toContain('No problems.');
        expect(section('Run history').textContent).toContain('No runs recorded.');
    });

    it('summary shows every count', () => {
        show({ state: state({ model: fullModel() }) });
        const summary = screen.getByRole('list', { name: 'Summary' });
        const items = within(summary).getAllByRole('listitem').map((item) => item.textContent);
        expect(items).toEqual(['2Needs your approval', '2In cooldown', '3Waiting for Sunday', '1Other open PRs', '1No release date', '2Problems']);
    });

    it('each section shows its columns and GitHub links from the spec', () => {
        show({ state: state({ model: fullModel() }), runs: [workflowRun()] });

        const approval = section('Needs your approval');
        const firstPr = within(approval).getAllByRole('row')[1];
        expect(headers(approval)).toEqual(['Repo', 'Title', 'Age', 'Checks', 'Links']);
        expect(firstPr.textContent).toContain('Update vite to v9');
        expect(firstPr.textContent).toContain('3 days');
        expect(firstPr.textContent).toContain('Passing');
        expect(hrefs(firstPr)).toEqual([
            'https://github.com/example-org/app-one',
            'https://github.com/example-org/app-one/pull/11',
            'https://github.com/example-vendor/vite/releases',
        ]);
        expect(within(approval).getAllByRole('row')[2].textContent).toContain('Failing');

        const cooldown = section('In cooldown');
        expect(headers(cooldown)).toEqual(['Repo', 'Update', 'Cooldown', 'PR', 'Links']);
        const firstUpdate = within(cooldown).getAllByRole('row')[1];
        expect(firstUpdate.textContent).toContain('typescript to 7.1.0');
        expect(firstUpdate.textContent).toContain('4 days left');
        expect(within(firstUpdate).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('43');
        expect(hrefs(firstUpdate)).toEqual([
            'https://github.com/example-org/app-one',
            'https://github.com/example-vendor/typescript/releases',
            'https://github.com/example-org/app-one/issues/12',
        ]);

        const waiting = section('Waiting for Sunday');
        expect(hrefs(waiting)).toContain('https://github.com/example-org/app-two/issues/7');
        expect(waiting.textContent).toContain('rxjs to 7.8.2');

        const other = section('Other open PRs');
        expect(headers(other)).toEqual(['Repo', 'Title', 'Age', 'Checks', 'Links']);
        expect(hrefs(other)).toContain('https://github.com/example-org/app-two/pull/33');
        expect(other.textContent).toContain('Pending');

        const problems = section('Problems');
        expect(headers(problems)).toEqual(['Kind', 'Repo', 'Package', 'Details']);
        expect(problems.textContent).toContain('Deprecated');
        expect(problems.textContent).toContain('uuidv4');
        expect(problems.textContent).toContain('The lockfile cannot be read.');
        expect(hrefs(problems)).toContain('https://github.com/example-org/app-two');

        const history = section('Run history');
        expect(headers(history)).toEqual(['Planned', 'Started', 'Late', 'Duration', 'Conclusion', 'Event']);
        const runRow = within(history).getAllByRole('row')[1];
        expect(runRow.textContent).toContain('Mon 2 Nov 03:15');
        expect(runRow.textContent).toContain('Mon 2 Nov 03:20');
        expect(runRow.textContent).toContain('5 min');
        expect(runRow.textContent).toContain('5 min 30 s');
        expect(runRow.textContent).toContain('success');
        expect(hrefs(runRow)).toEqual(['https://github.com/sondresjolyst/si-renovate-config/actions/runs/501']);
    });

    it('a run that was not scheduled has no planned time', () => {
        show({ runs: [workflowRun({ event: 'workflow_dispatch' })] });
        const row = within(section('Run history')).getAllByRole('row')[1];
        expect(row.textContent).toContain('Not planned');
        expect(row.textContent).toContain('workflow_dispatch');
    });

    it('a group PR with no single source says the notes are in the PR, and takes no link', () => {
        show({ state: state({ model: model({ needsApproval: [pr({ sourceUrl: null })] }) }) });
        const row = within(section('Needs your approval')).getAllByRole('row')[1];
        expect(row.textContent).toContain('Release notes in PR');
        expect(hrefs(row)).toHaveLength(2);
    });

    it('a source that is not on GitHub links to the source itself', () => {
        show({ state: state({ model: model({ needsApproval: [pr({ sourceUrl: 'https://gitlab.example/group/tool' })] }) }) });
        expect(hrefs(section('Needs your approval'))).toContain('https://gitlab.example/group/tool');
    });

    it('expected PR times carry the label "Expected"', () => {
        show({ state: state({ model: fullModel() }) });
        expect(within(section('In cooldown')).getAllByRole('row')[1].textContent).toContain('Expected Sun 8 Nov 03:15');
        const groups = section('Waiting for Sunday').querySelectorAll('details details > summary');
        expect(groups[0].textContent).toContain('Expected Sun 8 Nov 03:15');
    });

    it('an empty URL means no link, never href=""', () => {
        const { container } = show({
            state: state({
                model: model({
                    needsApproval: [pr({ url: '', sourceUrl: '' })],
                    cooldown: [update({ sourceUrl: '', dashboardIssue: null })],
                    otherPrs: [pr({ url: '', sourceUrl: null, repo: 'not a repo' })],
                }),
            }),
        });
        expect(container.querySelectorAll('a[href=""]')).toHaveLength(0);
        expect(container.querySelectorAll('a:not([href])')).toHaveLength(0);
        expect(within(section('Other open PRs')).getByText('PR #11')).toBeTruthy();
        expect(hrefs(section('Other open PRs'))).toEqual([]);
    });

    it('a link that is not http or https is not rendered as a link', () => {
        const { container } = show({ state: state({ model: model({ needsApproval: [pr({ url: 'javascript:alert(1)', sourceUrl: 'javascript:alert(2)' })] }) }) });
        expect(container.innerHTML).not.toContain('javascript:');
    });

    it('a PR title with markup renders as text', () => {
        const { container } = show({ state: state({ model: model({ needsApproval: [pr({ title: '<img src=x onerror=alert(1)>' })] }) }) });
        expect(container.querySelector('img')).toBeNull();
        expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    });

    it('tags show only the tag, with no warning text', () => {
        show({ state: state({ model: model({ waiting: [update({ tags: ['Major', 'No release date'] })] }) }) });
        const row = section('Waiting for Sunday').querySelector('details details tbody tr');
        expect(row?.textContent).toContain('Major');
        expect(row?.textContent).toContain('No release date');
        expect(section('Waiting for Sunday').textContent).not.toMatch(/hours old|check the release|manually/i);
    });

    it('long text is shortened on the row, with the whole text in details', () => {
        const long = `Replace this package. ${'The old API is gone. '.repeat(20)}End of text.`;
        show({ state: state({ model: model({ problems: [problem({ message: long })] }) }) });
        const details = section('Problems').querySelector('td details');
        expect(details).not.toBeNull();
        const summary = details?.querySelector('summary')?.textContent ?? '';
        expect(summary.length).toBeLessThan(130);
        expect(summary.startsWith('Replace this package.')).toBe(true);
        expect(details?.textContent).toContain('End of text.');
        expect(details?.hasAttribute('open')).toBe(false);
    });

    it('short text stays on the row with no details', () => {
        show({ state: state({ model: model({ problems: [problem()] }) }) });
        expect(section('Problems').querySelector('td details')).toBeNull();
    });

    describe('Waiting for Sunday', () => {
        const pins = Array.from({ length: 5 }, (_, index) =>
            update({ dep: `pin-${index}`, newVersion: '1.0.0', branch: 'renovate/pin-dependencies', cooldownEnd: null, daysLeft: null }),
        );
        const waitingModel = () =>
            model({
                waiting: [
                    ...pins,
                    update({ repo: 'example-org/app-two', dep: 'node', newVersion: '26.1.0', branch: 'renovate/docker-node', tags: ['No release date', 'Major'], cooldownEnd: null, daysLeft: null }),
                ],
            });

        it('groups rows by repo and branch, collapsed, with the count and expected PR', () => {
            show({ state: state({ model: waitingModel() }) });
            const waiting = section('Waiting for Sunday');
            const outer = waiting.querySelector('details');
            expect(outer?.hasAttribute('open')).toBe(false);
            expect(outer?.querySelector('summary')?.textContent).toContain('6 updates in 2 branches');
            const groups = [...waiting.querySelectorAll<HTMLDetailsElement>('details details')];
            expect(groups).toHaveLength(2);
            expect(groups.every((group) => !group.hasAttribute('open'))).toBe(true);
            const first = groups[0].querySelector('summary')?.textContent;
            expect(first).toContain('app-one');
            expect(first).toContain('renovate/pin-dependencies');
            expect(first).toContain('5 updates');
            expect(first).toContain('Expected Sun 8 Nov 03:15');
            const second = groups[1].querySelector('summary')?.textContent;
            expect(second).toContain('1 update');
            expect(second).toContain('Major');
            expect(second).toContain('No release date');
        });

        it('a filter reaches the rows inside the groups and opens them', () => {
            show({ state: state({ model: waitingModel() }) });
            fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'pin-3' } });
            const waiting = section('Waiting for Sunday');
            const groups = [...waiting.querySelectorAll('details')];
            expect(groups).toHaveLength(2);
            expect(groups.every((group) => group.hasAttribute('open'))).toBe(true);
            expect(waiting.textContent).toContain('pin-3 to 1.0.0');
            expect(waiting.textContent).not.toContain('pin-2 to 1.0.0');
            expect(waiting.textContent).toContain('1 update');
        });

        it('closes again when the filter is cleared', () => {
            show({ state: state({ model: waitingModel() }) });
            fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'pin-3' } });
            fireEvent.change(screen.getByLabelText('Text'), { target: { value: '' } });
            const groups = [...section('Waiting for Sunday').querySelectorAll('details')];
            expect(groups.every((group) => !group.hasAttribute('open'))).toBe(true);
        });
    });

    describe('filters', () => {
        const rows = (name: string) => section(name).textContent ?? '';

        it('repo filter, text filter and "No release date" filter narrow the rows without moving the sections', () => {
            show({ state: state({ model: fullModel() }), runs: [workflowRun()] });
            expect(headings()).toEqual(SECTIONS);

            fireEvent.change(screen.getByLabelText('Repo'), { target: { value: 'example-org/app-two' } });
            expect(headings()).toEqual(SECTIONS);
            expect(rows('Needs your approval')).toContain('Update lodash to v5');
            expect(rows('Needs your approval')).not.toContain('Update vite to v9');
            expect(rows('In cooldown')).toContain('eslint to 10.0.1');
            expect(rows('In cooldown')).not.toContain('typescript to 7.1.0');
            expect(rows('Waiting for Sunday')).toContain('node to 26.1.0');
            expect(rows('Waiting for Sunday')).not.toContain('rxjs to 7.8.2');
            expect(rows('Problems')).toContain('The lockfile cannot be read.');
            expect(rows('Problems')).not.toContain('uuidv4');
            fireEvent.change(screen.getByLabelText('Repo'), { target: { value: '' } });

            fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'SERILOG' } });
            expect(headings()).toEqual(SECTIONS);
            expect(rows('Other open PRs')).toContain('Update Serilog to v4');
            expect(rows('Needs your approval')).toContain('No rows match the filters.');
            expect(rows('Problems')).toContain('No rows match the filters.');
            fireEvent.change(screen.getByLabelText('Text'), { target: { value: '' } });

            fireEvent.click(screen.getByLabelText('No release date'));
            expect(headings()).toEqual(SECTIONS);
            expect(rows('Waiting for Sunday')).toContain('node to 26.1.0');
            expect(rows('Waiting for Sunday')).not.toContain('rxjs to 7.8.2');
            expect(rows('In cooldown')).toContain('No rows match the filters.');
            expect(rows('Run history')).toContain('Mon 2 Nov 03:20');
        });

        it('a section with no data keeps its own text while a filter is on', () => {
            show({ state: state({ model: model({ otherPrs: [pr()] }) }) });
            fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'no such text' } });
            expect(rows('Needs your approval')).toContain('Nothing needs your approval.');
            expect(rows('Other open PRs')).toContain('No rows match the filters.');
        });

        it('the repo filter lists each repo once', () => {
            show({ state: state({ model: fullModel() }) });
            const options = within(screen.getByLabelText('Repo')).getAllByRole('option').map((option) => option.textContent);
            expect(options).toEqual(['All repos', 'app-one', 'app-two']);
        });
    });
});
