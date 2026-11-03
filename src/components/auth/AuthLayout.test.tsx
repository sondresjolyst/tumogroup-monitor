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

    it('draws the week as a hidden drawing with seven days and no numbers or names', () => {
        const { container } = render(<AuthLayout>{null}</AuthLayout>);
        const drawing = container.querySelector('.week')!;
        expect(drawing.getAttribute('aria-hidden')).toBe('true');
        expect(drawing.querySelector('.week-days')!.textContent).toBe('MonTueWedThuFriSatSun');
        expect(drawing.textContent).not.toMatch(/[0-9]/);
        expect(drawing.querySelectorAll('.week-bar')).toHaveLength(8);
        expect(drawing.querySelectorAll('.week-dot')).toHaveLength(8);
        expect(container.querySelector('img')).toBeNull();
    });
});
