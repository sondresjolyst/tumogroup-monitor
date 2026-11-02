/**
 * Paths that need no login. Each one is an exact match, apart from `/api/auth`, which owns its
 * whole subtree. A path that only starts with one of these names is not public.
 */
export function isPublicPath(pathname: string): boolean {
    if (pathname.includes('..') || pathname.includes('\\')) return false;
    if (pathname === '/health' || pathname === '/denied') return true;
    return pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

/** Builds the sign-in URL. The callback is a path on this site, never a full URL. */
export function signInUrl(url: URL): string {
    const target = new URL('/api/auth/signin', url.origin);
    const back = url.pathname + url.search;
    // A path that starts with two slashes or a backslash would read as another site.
    const safe = back.startsWith('/') && !back.startsWith('//') && !back.startsWith('/\\') ? back : '/';
    target.searchParams.set('callbackUrl', safe);
    return target.pathname + target.search;
}
