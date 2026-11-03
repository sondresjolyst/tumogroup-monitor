import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SECTIONS = ['Needs your approval', 'In cooldown', 'Waiting for Sunday', 'Other open PRs', 'Problems', 'Run history'];

const screenshotDir = process.env.E2E_SCREENSHOT_DIR;

async function open(page: Page) {
    const problems: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    const response = await page.goto('/renovate');
    expect(response?.status()).toBe(200);
    await page.waitForLoadState('networkidle');
    return problems;
}

const headings = (page: Page) => page.locator('h2').evaluateAll((all) => all.map((heading) => heading.firstChild?.textContent));

test('the start page goes to the Renovate page', async ({ request }) => {
    const response = await request.get('/', { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe('/renovate');
});

test('sections come in the order of the spec, with no browser errors', async ({ page }) => {
    const problems = await open(page);
    expect(await headings(page)).toEqual(SECTIONS);
    expect(problems).toEqual([]);
});

test('warnings show on the page', async ({ page }) => {
    await open(page);
    const warnings = page.getByRole('status');
    await expect(warnings.filter({ hasText: 'The data is 33 hours old.' })).toBeVisible();
    await expect(warnings.filter({ hasText: /No scheduled run started on Sunday/ })).toBeVisible();
});

test('the header shows the run on main, and run history marks the branch run', async ({ page }) => {
    await open(page);
    const header = page.getByRole('banner');
    await expect(header).toContainText('success');
    await expect(header).not.toContainText('failure');
    await expect(page.getByRole('region', { name: /^Run history/ }).getByText('workflow_dispatch on example/test-branch')).toBeVisible();
});

test('a third-party title renders as text and an empty URL renders no link', async ({ page }) => {
    await open(page);
    await expect(page.getByText('<img src=x onerror=alert(1)> update nuget group')).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(0);
    await expect(page.locator('a[href=""], a:not([href])')).toHaveCount(0);
    await expect(page.getByRole('region', { name: /^Other open PRs/ }).getByText('PR #44')).toBeVisible();
});

test('no summary holds a link', async ({ page }) => {
    await open(page);
    await expect(page.locator('summary').first()).toBeAttached();
    await expect(page.locator('summary a')).toHaveCount(0);
});

test('Waiting for Sunday stays closed, and a filter reaches its rows without moving the sections', async ({ page }) => {
    await open(page);
    const waiting = page.getByRole('region', { name: /^Waiting for Sunday/ });
    await expect(waiting.locator('details').first()).not.toHaveAttribute('open');
    await expect(waiting.getByText('rxjs to', { exact: false })).toBeHidden();

    await page.getByLabel('Text').fill('rxjs');
    await expect(waiting.getByText('rxjs to', { exact: false })).toBeVisible();
    await expect(page.getByRole('region', { name: /^Needs your approval/ }).getByText('No rows match the filters.')).toBeVisible();
    expect(await headings(page)).toEqual(SECTIONS);

    await page.getByLabel('Text').fill('');
    await expect(waiting.getByText('rxjs to', { exact: false })).toBeHidden();
});

test('the page sets no horizontal scroll on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByLabel('Text').fill('a');
    const filtered = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(filtered).toBeLessThanOrEqual(0);

    await page.getByLabel('Text').fill('');
    const approval = page.getByRole('region', { name: /^Needs your approval/ });
    await expect(approval.getByRole('cell').filter({ hasText: 'Age' }).first()).toBeVisible();
    await expect(approval.getByRole('cell').filter({ hasText: 'Checks' }).first()).toBeVisible();
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'fixture-phone-filtered.png'), fullPage: true });
});

test('takes the screenshots', async ({ page }) => {
    test.skip(!screenshotDir, 'E2E_SCREENSHOT_DIR is not set');
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await page.screenshot({ path: join(screenshotDir ?? '', 'fixture-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(screenshotDir ?? '', 'fixture-phone.png'), fullPage: true });
});
