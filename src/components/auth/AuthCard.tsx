import type { ReactNode } from 'react';

/** The centered card that the sign-in, denied and auth-error pages share. */
export function AuthCard({ children }: { children: ReactNode }) {
    return (
        <main className="flex min-h-dvh items-center justify-center px-4 py-8">
            <div className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-line bg-surface p-6 sm:p-8">
                <h1 className="text-center text-xl font-semibold">Tumogroup monitor</h1>
                {children}
            </div>
        </main>
    );
}
