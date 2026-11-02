import { getServerSession, type NextAuthOptions, type Session } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { redirect } from 'next/navigation';

declare module 'next-auth' {
    interface Session {
        githubId?: string;
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        githubId?: string;
    }
}

const DIGITS = /^[0-9]+$/;

/** Turns a GitHub ID from a token into a string of digits, or null when it is anything else. */
function idToString(value: unknown): string | null {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
    }
    if (typeof value === 'string' && DIGITS.test(value)) return value;
    return null;
}

/**
 * Checks GitHub's numeric user ID against the allowed ID. It denies when either side is not a
 * string of digits, so an unset or empty allowlist denies everyone.
 */
export function isAllowedUser(githubId: unknown, allowed: string | undefined): boolean {
    if (typeof allowed !== 'string' || !DIGITS.test(allowed)) return false;
    const id = idToString(githubId);
    return id !== null && id === allowed;
}

export const authOptions: NextAuthOptions = {
    providers: [
        GithubProvider({
            clientId: process.env.GITHUB_CLIENT_ID ?? '',
            clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
            authorization: { params: { scope: 'read:user' } },
            profile(profile: { id: number | string }) {
                return { id: String(profile.id) };
            },
        }),
    ],
    session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
    pages: { error: '/denied' },
    callbacks: {
        signIn({ user }) {
            return isAllowedUser(user.id, process.env.ALLOWED_GITHUB_USER_ID) ? true : '/denied';
        },
        jwt({ token, user }) {
            if (user) token.githubId = user.id;
            return token;
        },
        session({ session, token }) {
            session.githubId = token.githubId;
            return session;
        },
    },
};

/**
 * Returns the session of the owner. It checks the stored ID against the allowed ID on every call,
 * so a session stops working once `ALLOWED_GITHUB_USER_ID` changes. Anyone else is redirected.
 */
export async function requireOwner(): Promise<Session> {
    const session = await getServerSession(authOptions);
    if (!session) redirect('/api/auth/signin');
    if (!isAllowedUser(session.githubId, process.env.ALLOWED_GITHUB_USER_ID)) redirect('/denied');
    return session;
}
