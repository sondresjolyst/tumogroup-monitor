// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthCard } from './AuthCard';

describe('AuthCard', () => {
    it('has the app name as the heading and shows its children', () => {
        render(<AuthCard><p>Inside</p></AuthCard>);
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tumogroup monitor');
        expect(screen.getByText('Inside')).toBeTruthy();
        expect(screen.getByRole('main')).toBeTruthy();
    });
});
