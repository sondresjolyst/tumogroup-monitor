import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('job bundle', () => {
    it('loads as an ES module and names the missing setting, with a non-zero exit', () => {
        const build = spawnSync(process.execPath, ['scripts/build-job.mjs'], { cwd: root, encoding: 'utf8' });
        expect(build.status).toBe(0);
        const run = spawnSync(process.execPath, ['job/refresh.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, DATABASE_URL: '' } });
        expect(run.stderr.trim()).toBe('DATABASE_URL is not set.');
        expect(run.status).toBe(1);
    }, 60_000);
});
