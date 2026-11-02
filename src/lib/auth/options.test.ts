import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from 'next-auth';
import { authOptions, isAllowedUser } from './options';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('isAllowedUser', () => {
    it('allowed ID passes', () => {
        expect(isAllowedUser('12345', '12345')).toBe(true);
    });

    it('accepts a numeric ID from the token', () => {
        expect(isAllowedUser(12345, '12345')).toBe(true);
    });

    it('other ID fails', () => {
        expect(isAllowedUser('54321', '12345')).toBe(false);
    });

    it('unset allowlist denies everyone', () => {
        expect(isAllowedUser('12345', undefined)).toBe(false);
        expect(isAllowedUser(undefined, undefined)).toBe(false);
    });

    it('empty allowlist denies everyone', () => {
        expect(isAllowedUser('', '')).toBe(false);
        expect(isAllowedUser('12345', '')).toBe(false);
    });

    it('matching login with a different ID fails', () => {
        expect(isAllowedUser('octocat', '12345')).toBe(false);
    });

    it('rejects an allowlist that is not only digits', () => {
        expect(isAllowedUser('octocat', 'octocat')).toBe(false);
        expect(isAllowedUser('12345', '12345 ')).toBe(false);
        expect(isAllowedUser('12345', '12345,67890')).toBe(false);
        expect(isAllowedUser('-1', '-1')).toBe(false);
        expect(isAllowedUser('1.5', '1.5')).toBe(false);
    });

    it('rejects a missing or malformed ID', () => {
        expect(isAllowedUser(null, '12345')).toBe(false);
        expect(isAllowedUser(undefined, '12345')).toBe(false);
        expect(isAllowedUser({}, '12345')).toBe(false);
        expect(isAllowedUser(['12345'], '12345')).toBe(false);
        expect(isAllowedUser(Number.NaN, '12345')).toBe(false);
        expect(isAllowedUser(1e21, '1000000000000000000000')).toBe(false);
    });
});

describe('callbacks', () => {
    const signIn = authOptions.callbacks!.signIn!;
    const jwt = authOptions.callbacks!.jwt!;
    const session = authOptions.callbacks!.session!;

    it('signIn callback returns the denied page for other accounts', async () => {
        vi.stubEnv('ALLOWED_GITHUB_USER_ID', '12345');
        const result = await signIn({ user: { id: '999' }, account: null });
        expect(result).toBe('/denied');
    });

    it('signIn callback returns the denied page when the allowlist is unset', async () => {
        vi.stubEnv('ALLOWED_GITHUB_USER_ID', '');
        const result = await signIn({ user: { id: '12345' }, account: null });
        expect(result).toBe('/denied');
    });

    it('signIn callback lets the owner in', async () => {
        vi.stubEnv('ALLOWED_GITHUB_USER_ID', '12345');
        const result = await signIn({ user: { id: '12345' }, account: null });
        expect(result).toBe(true);
    });

    it('stores the numeric ID in the token at sign-in and keeps it later', async () => {
        const first = await jwt({ token: {}, user: { id: '12345' } } as Parameters<typeof jwt>[0]);
        expect(first.githubId).toBe('12345');
        const later = await jwt({ token: first } as Parameters<typeof jwt>[0]);
        expect(later.githubId).toBe('12345');
    });

    it('puts the ID on the session', async () => {
        const result = await session({ session: { expires: 'x' }, token: { githubId: '12345' } } as Parameters<typeof session>[0]);
        expect((result as Session).githubId).toBe('12345');
    });

    it('uses the profile ID, not the login name', () => {
        const provider = authOptions.providers[0] as unknown as {
            options: { profile: (p: Record<string, unknown>) => { id: string } };
        };
        const user = provider.options.profile({ id: 12345, login: 'octocat', name: 'x', email: 'a@b.c', avatar_url: '' });
        expect(user.id).toBe('12345');
    });
});
