'use client';

import { signIn } from 'next-auth/react';

export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
    return (
        <button type="button" className="rounded-button border border-line px-3 py-1.5 text-sm hover:bg-surface" onClick={() => signIn('github', { callbackUrl })}>
            Sign in with GitHub
        </button>
    );
}
