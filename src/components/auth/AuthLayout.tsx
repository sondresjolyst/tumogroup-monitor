import { Bricolage_Grotesque } from 'next/font/google';
import type { ReactNode } from 'react';
import { WeekDrawing } from './WeekDrawing';

// Self-hosted at build time, so the page makes no request to Google. Only the auth pages use it.
const heading = Bricolage_Grotesque({ subsets: ['latin'], weight: '600', display: 'swap' });

/** The split screen that the sign-in, denied and auth-error pages share. */
export function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <main className="flex min-h-dvh flex-col bg-auth-form text-auth-text md:flex-row">
            <WeekDrawing />
            <div className="flex flex-1 items-center justify-center px-6 py-10">
                <div data-auth-content className="flex w-full max-w-[22rem] flex-col items-stretch gap-3">
                    <h1 className={`${heading.className} text-[1.875rem] leading-tight tracking-[-0.03em] md:text-4xl`}>Tumogroup monitor</h1>
                    {children}
                </div>
            </div>
        </main>
    );
}
