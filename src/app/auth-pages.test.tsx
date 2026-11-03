// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({ Bricolage_Grotesque: () => ({ className: 'heading-font' }) }));
vi.mock('next-auth/react', () => ({ signIn: vi.fn() }));
vi.mock('next/navigation', () => ({
    redirect: (to: string) => {
        throw new Error(`redirect:${to}`);
    },
}));

import AuthError from './auth-error/page';
import Denied from './denied/page';
import SignIn from './signin/page';

describe('auth pages', () => {
    it('sign-in has the heading and one GitHub button and no other text', async () => {
        render(await SignIn({ searchParams: Promise.resolve({ callbackUrl: '/renovate' }) }));
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tumogroup monitor');
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy();
        const content = document.querySelector('[data-auth-content]')!;
        expect(content.textContent).toBe('Tumogroup monitorMonitor your repos in one place.Sign in with GitHub');
    });

    it('denied keeps its wording and offers no sign-in', () => {
        render(<Denied />);
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tumogroup monitor');
        expect(screen.getByText('This account does not have access to this page.')).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('auth-error keeps its wording and the way to try again', async () => {
        render(await AuthError({ searchParams: Promise.resolve({ error: 'Callback' }) }));
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tumogroup monitor');
        expect(screen.getByText('Sign-in failed.')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe('/signin');
    });

    it('auth-error sends a rejected account to denied', async () => {
        await expect(AuthError({ searchParams: Promise.resolve({ error: 'AccessDenied' }) })).rejects.toThrow('redirect:/denied');
    });
});
