// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({ Bricolage_Grotesque: () => ({ className: 'heading-font' }) }));

import { AuthLayout } from './AuthLayout';

describe('AuthLayout', () => {
    it('has the app name as the heading and shows its children', () => {
        render(<AuthLayout><p>Inside</p></AuthLayout>);
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tumogroup monitor');
        expect(screen.getByRole('heading', { level: 1 }).className).toContain('heading-font');
        expect(screen.getByText('Inside')).toBeTruthy();
        expect(screen.getByRole('main')).toBeTruthy();
    });

    it('is one centered column with no drawing and no image', () => {
        const { container } = render(<AuthLayout>{null}</AuthLayout>);
        expect(container.querySelector('[aria-hidden]')).toBeNull();
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('main')!.className).toContain('justify-center');
        expect(container.querySelector('[data-auth-content]')!.className).toContain('max-w-[22rem]');
    });
});
