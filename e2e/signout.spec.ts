import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const screenshotDir = process.env.E2E_SCREENSHOT_DIR;
const sessionToken = process.env.E2E_SESSION_TOKEN ?? '';

// This check uses a browser cookie jar, so it sends no session header and sets the cookie itself.
test.use({ extraHTTPHeaders: { Cookie: '' } });

test('Sign out ends on the sign-in page, drops the session and closes the Renovate page', async ({ page, context, baseURL }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    // The server marks the cookie Secure and the test runs on http, so the cookie is set for localhost.
    await context.addCookies([{ name: '__Secure-next-auth.session-token', value: sessionToken, domain: 'localhost', path: '/', secure: true, httpOnly: true }]);

    // NEXTAUTH_URL is https while the test server speaks http, so the redirect after sign-out is served from the http server.
    const httpsOrigin = baseURL!.replace('http://', 'https://');
    await page.route(`${httpsOrigin}/**`, async (route) => {
        const response = await page.request.fetch(route.request().url().replace(httpsOrigin, baseURL!), { maxRedirects: 0 });
        await route.fulfill({ response });
    });

    await page.goto('/renovate');
    const button = page.getByRole('banner').getByRole('button', { name: 'Sign out' });
    await expect(button).toBeVisible();
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'signout.png') });

    const signOutPost = page.waitForResponse((response) => response.url().endsWith('/api/auth/signout') && response.request().method() === 'POST');
    await button.click();
    expect((await signOutPost).status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/signin/);
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
    expect((await context.cookies()).filter((cookie) => cookie.name.endsWith('next-auth.session-token') && cookie.value !== '')).toEqual([]);

    await page.goto('/renovate');
    await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Frenovate/);
    expect(problems).toEqual([]);
});
