import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function AuthError({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
    const { error } = await searchParams;
    // A rejected account is sent to the denied page. Every other error is a failed sign-in.
    if (error === 'AccessDenied') redirect('/denied');
    return (
        <main className="p-6 text-sm">
            <p>Sign-in failed.</p>
            <Link href="/signin" className="text-link hover:underline">Try again</Link>
        </main>
    );
}
