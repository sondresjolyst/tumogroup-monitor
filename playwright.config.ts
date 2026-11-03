import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || join(tmpdir(), 'tumogroup-monitor-playwright'),
    reporter: 'list',
    fullyParallel: true,
    use: {
        baseURL: process.env.E2E_BASE_URL,
        // A browser refuses to store a Secure cookie for an http address, so the header carries the session.
        extraHTTPHeaders: { Cookie: `__Secure-next-auth.session-token=${process.env.E2E_SESSION_TOKEN}` },
    },
    projects: [
        { name: 'read', testIgnore: /retry\.spec/ },
        // This check breaks the stored page state for a moment, so it runs after the others are done.
        { name: 'retry', testMatch: /retry\.spec/, dependencies: ['read'] },
    ],
});
