import { expect, test } from '@playwright/test';
import { Pool } from 'pg';

const databaseUrl = process.env.E2E_DATABASE_URL;

test('Try again refetches the page without a full reload', async ({ page }) => {
    test.skip(!databaseUrl, 'E2E_DATABASE_URL is not set');
    const pool = new Pool({ connectionString: databaseUrl });
    const saved = (await pool.query('SELECT model FROM current_state')).rows[0]?.model;
    expect(saved).toBeTruthy();
    try {
        // A model of the right version but with no sections makes the render throw.
        await pool.query('UPDATE current_state SET model = $1::jsonb', [JSON.stringify({ modelVersion: saved.modelVersion })]);
        await page.goto('/renovate');
        const failure = page.getByRole('alert').filter({ hasText: 'The page cannot show the data.' });
        await expect(failure).toBeVisible();

        await pool.query('UPDATE current_state SET model = $1::jsonb', [JSON.stringify(saved)]);
        await page.evaluate(() => {
            (window as unknown as { __kept: boolean }).__kept = true;
        });
        await page.getByRole('button', { name: 'Try again' }).click();

        await expect(page.getByRole('heading', { name: /^Needs your approval/ })).toBeVisible();
        await expect(failure).toHaveCount(0);
        expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
    } finally {
        await pool.query('UPDATE current_state SET model = $1::jsonb', [JSON.stringify(saved)]);
        await pool.end();
    }
});
