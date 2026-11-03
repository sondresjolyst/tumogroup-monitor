import type { Metadata } from 'next';
import { RenovateView } from '@/components/renovate/RenovateView';
import { requireOwner } from '@/lib/auth/options';
import { readPageData } from '@/lib/db/pool';

export const metadata: Metadata = { title: 'Renovate' };

export default async function RenovatePage() {
    await requireOwner();
    const { state, runs } = await readPageData();
    return <RenovateView state={state} runs={runs} now={new Date()} />;
}
