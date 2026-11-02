const PUBLIC_PATHS = new Set(['/health', '/denied', '/signin', '/auth-error']);

/**
 * Paths that need no login. Each one is an exact match, apart from `/api/auth`, which owns its
 * whole subtree. A path that only starts with one of these names is not public.
 */
export function isPublicPath(pathname: string): boolean {
    if (pathname.includes('..') || pathname.includes('\\')) return false;
    if (PUBLIC_PATHS.has(pathname)) return true;
    return pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

/** Returns the callback as a path on this site, or the start page when it is anything else. */
export function safeCallback(value: unknown): string {
    if (typeof value !== 'string') return '/';
    // A path that starts with two slashes or a backslash would read as another site.
    if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
    return value;
}

/** Builds the sign-in URL. The callback is a path on this site, never a full URL. */
export function signInUrl(url: URL): string {
    const target = new URL('/signin', url.origin);
    target.searchParams.set('callbackUrl', safeCallback(url.pathname + url.search));
    return target.pathname + target.search;
}

/**
 * True when production runs without an https `NEXTAUTH_URL`. Without it the session cookie would
 * not be marked secure, so the page stays closed. Other environments may use http on localhost.
 */
export function authMisconfigured(env: Record<string, string | undefined>): boolean {
    if (env.NODE_ENV !== 'production') return false;
    try {
        return new URL(env.NEXTAUTH_URL ?? '').protocol !== 'https:';
    } catch {
        return true;
    }
}

let logged = false;

/** Logs once that the sign-in setup is unsafe. */
export function logMisconfigured(): void {
    if (logged) return;
    logged = true;
    console.error('NEXTAUTH_URL must be an https URL in production. Every page except /health stays closed.');
}
