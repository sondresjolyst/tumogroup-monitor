import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const screenshotDir = process.env.E2E_SCREENSHOT_DIR;

// The session header from the config would turn the sign-in page into a redirect, so these checks send none.
test.use({ extraHTTPHeaders: { Cookie: '' } });

function watch(page: Page) {
    const problems: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    return problems;
}

test('the sign-in page is a split screen with the week drawing and no browser errors', async ({ page, baseURL }) => {
    const problems = watch(page);
    const outside: string[] = [];
    page.on('request', (request) => {
        if (!request.url().startsWith(baseURL!) && !request.url().startsWith('data:')) outside.push(request.url());
    });
    const response = await page.goto('/signin');
    expect(response?.status()).toBe(200);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: 'Tumogroup monitor' })).toBeVisible();
    await expect(page.getByText('Renovate updates across your repos.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
    await expect(page.locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => document.fonts.check('600 36px "Bricolage Grotesque"'))).toBe(true);

    const viewport = page.viewportSize()!;
    const panel = (await page.locator('.week').boundingBox())!;
    expect(Math.abs(panel.width / viewport.width - 0.6)).toBeLessThan(0.01);
    expect(panel.height).toBeGreaterThanOrEqual(viewport.height - 1);
    const content = (await page.locator('[data-auth-content]').boundingBox())!;
    expect(content.width).toBeLessThanOrEqual(22 * 16 + 1);
    expect(Math.abs(content.y + content.height / 2 - viewport.height / 2)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(problems).toEqual([]);
    expect(outside).toEqual([]);
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'signin.png') });
});

test('on a phone the drawing is a band above the content with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/signin');
    await page.waitForLoadState('networkidle');
    const panel = (await page.locator('.week').boundingBox())!;
    expect(panel.width).toBe(390);
    expect(panel.height).toBe(200);
    const content = (await page.locator('[data-auth-content]').boundingBox())!;
    expect(content.y).toBeGreaterThanOrEqual(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('clicking the button goes to GitHub with the callback kept', async ({ page }) => {
    await page.goto('/signin?callbackUrl=%2Frenovate');
    // Stop at the first request that leaves the app, so the test never reaches the real GitHub.
    let githubUrl = '';
    await page.route('https://github.com/**', (route) => {
        githubUrl = route.request().url();
        return route.abort();
    });
    const start = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/auth/signin/github'));
    await page.getByRole('button', { name: 'Sign in with GitHub' }).click();
    expect(new URLSearchParams((await start).postData() ?? '').get('callbackUrl')).toBe('/renovate');
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeDisabled();
    await expect.poll(() => githubUrl, { timeout: 10_000 }).toContain('https://github.com/login/oauth/authorize');
    expect(new URL(githubUrl).searchParams.get('client_id')).toBe('invented-client-id');
});

test('the denied and auth-error pages use the same layout', async ({ page }) => {
    for (const [path, text] of [
        ['/denied', 'This account does not have access to this page.'],
        ['/auth-error?error=Callback', 'Sign-in failed.'],
    ]) {
        const problems = watch(page);
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: 'Tumogroup monitor' })).toBeVisible();
        await expect(page.getByText(text)).toBeVisible();
        expect(problems).toEqual([]);
    }
    await expect(page.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/signin');
});
