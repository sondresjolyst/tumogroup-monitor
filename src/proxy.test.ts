import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getToken = vi.fn();
vi.mock('next-auth/jwt', () => ({ getToken: (...args: unknown[]) => getToken(...args) }));

import { proxy } from './proxy';

const call = (path: string) => proxy(new NextRequest(new URL(path, 'https://monitor.example.test')));

afterEach(() => {
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
        expect(new URL(res.headers.get('location')!).pathname).toBe('/api/auth/signin');
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

    it('treats a token error as no session', async () => {
        getToken.mockRejectedValue(new Error('bad'));
        const res = await call('/api/x');
        expect(res.status).toBe(401);
    });
});
