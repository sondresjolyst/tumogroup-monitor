'use client';

import { signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';

export function SignOutButton() {
    const [pending, setPending] = useState(false);

    // A back navigation can restore this page from the cache while the button is still disabled.
    useEffect(() => {
        const reset = (event: PageTransitionEvent) => {
            if (event.persisted) setPending(false);
        };
        window.addEventListener('pageshow', reset);
        return () => window.removeEventListener('pageshow', reset);
    }, []);

    async function start() {
        setPending(true);
        try {
            await signOut({ callbackUrl: '/signin' });
        } catch {
            setPending(false);
        }
    }

    return (
        <button
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={start}
            className="shrink-0 rounded-button border border-line px-3 py-1.5 text-sm text-muted enabled:hover:bg-surface enabled:hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-progress"
        >
            Sign out
        </button>
    );
}
