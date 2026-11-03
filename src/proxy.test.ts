import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getToken = vi.fn();
vi.mock('next-auth/jwt', () => ({ getToken: (...args: unknown[]) => getToken(...args) }));

import { proxy } from './proxy';

const call = (path: string) => proxy(new NextRequest(new URL(path, 'https://monitor.example.test')));

afterEach(() => {
    vi.restoreAllMocks();
    getToken.mockReset();
    vi.unstubAllEnvs();
});

describe('proxy', () => {
    it('lets public paths through without a token', async () => {
        const res = await call('/health');
        expect(res.headers.get('x-middleware-next')).toBe('1');
        expect(getToken).not.toHaveBeenCalled();
    });

    it('redirects a page without a session to sign-in', async () => {
        getToken.mockResolvedValue(null);
        const res = await call('/renovate');
        expect(res.status).toBe(307);
        expect(new URL(res.headers.get('location')!).pathname).toBe('/signin');
    });

    it('answers 401 for an API path without a session', async () => {
        getToken.mockResolvedValue(null);
        const res = await call('/api/anything');
        expect(res.status).toBe(401);
    });

    it('does not let a look-alike path through', async () => {
        getToken.mockResolvedValue(null);
        for (const path of ['/health/x', '/deniedx', '/api/authx']) {
            const res = await call(path);
            expect(res.headers.get('x-middleware-next')).toBeNull();
        }
    });

    it('lets the owner through', async () => {
        vi.stubEnv('ALLOWED_GITHUB_USER_ID', '12345');
        getToken.mockResolvedValue({ githubId: '12345' });
        const res = await call('/');
        expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('stops a session once the allowed ID changes', async () => {
        vi.stubEnv('ALLOWED_GITHUB_USER_ID', '99999');
        getToken.mockResolvedValue({ githubId: '12345' });
        const res = await call('/');
        expect(res.headers.get('x-middleware-next')).toBeNull();
        expect(new URL(res.headers.get('location')!).pathname).toBe('/denied');
    });

    it('fails closed with 503 in production without an https NEXTAUTH_URL', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXTAUTH_URL', 'http://monitor.example.test');
        vi.stubEnv('ALLOWED_GITHUB_USER_ID', '12345');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        getToken.mockResolvedValue({ githubId: '12345' });
        const res = await call('/');
        expect(res.status).toBe(503);
        expect((await call('/health')).headers.get('x-middleware-next')).toBe('1');
    });

    it.each(['/api/auth/callback/github', '/api/auth/signin', '/signin', '/auth-error'])(
        'returns 503 for %s when the auth address is misconfigured',
        async (path) => {
            vi.stubEnv('NODE_ENV', 'production');
            vi.stubEnv('NEXTAUTH_URL', 'http://monitor.example.test');
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const res = await call(path);
            expect(res.status).toBe(503);
            expect(res.headers.get('set-cookie')).toBeNull();
        },
    );

    it('keeps /health open when the auth address is misconfigured', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXTAUTH_URL', '');
        const res = await call('/health');
        expect(res.status).toBe(200);
        expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('treats a token error as no session', async () => {
        getToken.mockRejectedValue(new Error('bad'));
        const res = await call('/api/x');
        expect(res.status).toBe(401);
    });
});
