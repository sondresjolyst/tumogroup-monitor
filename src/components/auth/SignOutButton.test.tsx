// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn();
vi.mock('next-auth/react', () => ({ signOut: (...args: unknown[]) => signOut(...args) }));

import { SignOutButton } from './SignOutButton';

afterEach(() => {
    cleanup();
    signOut.mockReset();
});

describe('SignOutButton', () => {
    it('signs out and returns to the sign-in page', () => {
        signOut.mockReturnValue(new Promise(() => {}));
        render(<SignOutButton />);
        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(signOut).toHaveBeenCalledExactlyOnceWith({ callbackUrl: '/signin' });
    });

    it('is disabled and busy while pending, and ignores a second click', () => {
        signOut.mockReturnValue(new Promise(() => {}));
        render(<SignOutButton />);
        fireEvent.click(screen.getByRole('button'));
        const button = screen.getByRole('button', { name: 'Sign out' }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(button.getAttribute('aria-busy')).toBe('true');
        fireEvent.click(button);
        expect(signOut).toHaveBeenCalledOnce();
    });

    it('becomes usable again when the sign-out fails', async () => {
        signOut.mockRejectedValue(new Error('x'));
        render(<SignOutButton />);
        fireEvent.click(screen.getByRole('button'));
        await vi.waitFor(() => expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false));
    });

    it('becomes usable again when the page is restored from the cache', () => {
        signOut.mockReturnValue(new Promise(() => {}));
        render(<SignOutButton />);
        fireEvent.click(screen.getByRole('button'));
        const restored = new Event('pageshow') as PageTransitionEvent;
        Object.defineProperty(restored, 'persisted', { value: true });
        act(() => { window.dispatchEvent(restored); });
        expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    });
});
