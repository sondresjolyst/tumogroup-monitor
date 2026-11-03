// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RenovateError from './error';

describe('RenovateError', () => {
    it('says the page cannot show the data, without the error text', () => {
        const error = new Error('postgres://u:invented@db.example/x');
        render(<RenovateError error={error} retry={() => {}} />);
        expect(screen.getByRole('alert').textContent).toBe('The page cannot show the data.');
        expect(document.body.textContent).not.toContain('invented');
    });

    it('offers a retry', () => {
        const retry = vi.fn();
        render(<RenovateError error={new Error('x')} retry={retry} />);
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
