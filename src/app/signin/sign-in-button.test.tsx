// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signIn = vi.fn();
vi.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

import { SignInButton } from './sign-in-button';

afterEach(() => {
    cleanup();
    signIn.mockReset();
});

describe('SignInButton', () => {
    it('shows the GitHub mark inline and the label', () => {
        render(<SignInButton callbackUrl="/renovate" />);
        const button = screen.getByRole('button', { name: 'Sign in with GitHub' });
        expect(button.querySelector('svg')).not.toBeNull();
        expect(button.querySelector('img')).toBeNull();
        expect((button as HTMLButtonElement).disabled).toBe(false);
    });

    it('starts the GitHub sign-in with the callback kept', () => {
        signIn.mockReturnValue(new Promise(() => {}));
        render(<SignInButton callbackUrl="/renovate?x=1" />);
        fireEvent.click(screen.getByRole('button'));
        expect(signIn).toHaveBeenCalledExactlyOnceWith('github', { callbackUrl: '/renovate?x=1' });
    });

    it('is disabled and busy while the redirect starts, with the label unchanged', () => {
        signIn.mockReturnValue(new Promise(() => {}));
        render(<SignInButton callbackUrl="/renovate" />);
        fireEvent.click(screen.getByRole('button'));
        const button = screen.getByRole('button', { name: 'Sign in with GitHub' }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(button.getAttribute('aria-busy')).toBe('true');
        fireEvent.click(button);
        expect(signIn).toHaveBeenCalledOnce();
    });

    it('becomes usable again when the sign-in cannot start', async () => {
        signIn.mockRejectedValue(new Error('x'));
        render(<SignInButton callbackUrl="/renovate" />);
        fireEvent.click(screen.getByRole('button'));
        await vi.waitFor(() => expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false));
    });
});
