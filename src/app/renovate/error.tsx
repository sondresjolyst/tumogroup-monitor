'use client';

import { Alert } from '@sjolystinnovation/app-kit/ui';

/** The error text can hold a connection string, so the page never shows it. */
export default function RenovateError({ reset }: { error: Error; reset: () => void }) {
    return (
        <main className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-5">
            <Alert variant="error" role="alert">
                The page cannot show the data.
            </Alert>
            <button type="button" className="rounded-button border border-line px-3 py-1.5 text-sm hover:bg-surface" onClick={reset}>
                Try again
            </button>
        </main>
    );
}
