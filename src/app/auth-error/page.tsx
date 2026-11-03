import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthLayout } from '@/components/auth/AuthLayout';

export default async function AuthError({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
    const { error } = await searchParams;
    // A rejected account is sent to the denied page. Every other error is a failed sign-in.
    if (error === 'AccessDenied') redirect('/denied');
    return (
        <AuthLayout>
            <p className="text-base">Sign-in failed.</p>
            <Link href="/signin" className="w-fit text-base underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-auth-text">
                Try again
            </Link>
        </AuthLayout>
    );
}
