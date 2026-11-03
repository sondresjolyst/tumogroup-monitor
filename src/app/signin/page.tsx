import { safeCallback } from '@/lib/auth/gate';
import { SignInButton } from './sign-in-button';

export default async function SignIn({ searchParams }: { searchParams: Promise<{ callbackUrl?: string | string[] }> }) {
    const { callbackUrl } = await searchParams;
    return (
        <main className="p-6">
            <SignInButton callbackUrl={safeCallback(callbackUrl)} />
        </main>
    );
}
