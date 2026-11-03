import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth/options';

export default async function Home() {
    await requireOwner();
    redirect('/renovate');
}
