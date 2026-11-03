import type { UpdateRow } from '@/lib/model/types';
import { ExternalLink, ReleaseNotes, Unavailable, repoUrl } from './ui';

export function DashboardLink({ repo, issue }: { repo: string; issue: number | null }) {
    const url = repoUrl(repo);
    if (!url || issue === null) return <Unavailable>No dashboard</Unavailable>;
    return <ExternalLink href={`${url}/issues/${issue}`}>Dashboard</ExternalLink>;
}

export function UpdateLinks({ row }: { row: UpdateRow }) {
    return (
        <span className="inline-flex gap-3">
            <ReleaseNotes sourceUrl={row.sourceUrl} fallback="No release notes" />
            <DashboardLink repo={row.repo} issue={row.dashboardIssue} />
        </span>
    );
}
