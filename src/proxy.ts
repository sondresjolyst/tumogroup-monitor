import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';
import { authMisconfigured, isPublicPath, logMisconfigured, signInUrl } from '@/lib/auth/gate';
import { isAllowedUser } from '@/lib/auth/options';

async function readToken(req: NextRequest) {
    try {
        return await getToken({ req });
    } catch {
        return null;
    }
}

export async function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;
    if (isPublicPath(pathname)) return NextResponse.next();

    if (authMisconfigured(process.env)) {
        logMisconfigured();
        return new NextResponse('Service unavailable', { status: 503 });
    }

    const token = await readToken(req);
    const isApi = pathname === '/api' || pathname.startsWith('/api/');

    if (!token) {
        if (isApi) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        return NextResponse.redirect(new URL(signInUrl(req.nextUrl), req.nextUrl.origin));
    }

    if (!isAllowedUser(token.githubId, process.env.ALLOWED_GITHUB_USER_ID)) {
        if (isApi) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
        return NextResponse.redirect(new URL('/denied', req.nextUrl.origin));
    }

    return NextResponse.next();
}

// Every path goes through the check, except the built static files. The public paths are
// decided in isPublicPath, so a gap here cannot open a page.
export const config = {
    matcher: ['/((?!_next/static/).*)'],
};
