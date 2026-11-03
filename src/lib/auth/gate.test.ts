import { describe, expect, it } from 'vitest';
import { authMisconfigured, isPublicPath, safeCallback, signInUrl } from './gate';

describe('isPublicPath', () => {
    it.each(['/health', '/denied', '/signin', '/auth-error', '/api/auth', '/api/auth/signin', '/api/auth/callback/github'])('lets %s through', (path) => {
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
        '/signin/x',
        '/signinx',
        '/auth-error/x',
        '/auth-errors',
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
        expect(url.pathname).toBe('/signin');
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

describe('safeCallback', () => {
    it('keeps a path on this site', () => {
        expect(safeCallback('/renovate?x=1')).toBe('/renovate?x=1');
    });

    it.each([undefined, '', 'https://evil.test/x', '//evil.test', '/\\evil.test', 'renovate', ['/a']])('falls back to the start page for %s', (value) => {
        expect(safeCallback(value)).toBe('/');
    });
});

describe('authMisconfigured', () => {
    it('fails closed in production without an https NEXTAUTH_URL', () => {
        expect(authMisconfigured({ NODE_ENV: 'production' })).toBe(true);
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: '' })).toBe(true);
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: 'http://monitor.example.test' })).toBe(true);
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: 'http://localhost:3000' })).toBe(true);
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: 'not a url' })).toBe(true);
    });

    it('requires the literal lower case https:// prefix', () => {
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: 'HTTPS://monitor.example.test' })).toBe(true);
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: ' https://monitor.example.test' })).toBe(true);
    });

    it('accepts https in production', () => {
        expect(authMisconfigured({ NODE_ENV: 'production', NEXTAUTH_URL: 'https://monitor.example.test' })).toBe(false);
    });

    it('allows http on localhost outside production', () => {
        expect(authMisconfigured({ NODE_ENV: 'development', NEXTAUTH_URL: 'http://localhost:3000' })).toBe(false);
        expect(authMisconfigured({ NODE_ENV: 'test' })).toBe(false);
    });
});
