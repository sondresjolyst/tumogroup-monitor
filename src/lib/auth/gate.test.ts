import { describe, expect, it } from 'vitest';
import { isPublicPath, signInUrl } from './gate';

describe('isPublicPath', () => {
    it.each(['/health', '/denied', '/api/auth', '/api/auth/signin', '/api/auth/callback/github'])('lets %s through', (path) => {
        expect(isPublicPath(path)).toBe(true);
    });

    it.each([
        '/',
        '/renovate',
        '/api/anything',
        '/health/x',
        '/health/',
        '/healthz',
        '/deniedx',
        '/denied/x',
        '/api/authx',
        '/api/auth.json',
        '/Health',
        '/_next/image',
        '/api/auth/../secret',
    ])('keeps %s behind the owner check', (path) => {
        expect(isPublicPath(path)).toBe(false);
    });
});

describe('signInUrl', () => {
    const origin = 'https://monitor.example.test';

    it('sends the visitor back to the same page', () => {
        const url = new URL(signInUrl(new URL('/renovate?x=1', origin)), origin);
        expect(url.pathname).toBe('/api/auth/signin');
        expect(url.searchParams.get('callbackUrl')).toBe('/renovate?x=1');
    });

    it('keeps the callback on the same origin for odd paths', () => {
        for (const path of ['//evil.test/x', '/\\evil.test', '/%2F%2Fevil.test']) {
            const url = new URL(signInUrl(new URL(path, origin)), origin);
            const callback = url.searchParams.get('callbackUrl')!;
            expect(new URL(callback, origin).origin).toBe(origin);
        }
    });
});
