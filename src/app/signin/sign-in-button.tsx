'use client';

import { signIn } from 'next-auth/react';

export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
    return (
        <button type="button" onClick={() => signIn('github', { callbackUrl })}>
            Sign in with GitHub
        </button>
    );
}
