// Runs the Playwright checks against the production build, with a seeded Postgres and a test-only
// session. Run `npm run build` first. Every value here is invented for the test.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encode } from 'next-auth/jwt';

const root = fileURLToPath(new URL('..', import.meta.url));
const standalone = fileURLToPath(new URL('../.next/standalone/', import.meta.url));

const name = 'tumogroup-monitor-e2e-db';
const dbPort = '54330';
const appPort = process.env.E2E_APP_PORT ?? '3930';
const databaseUrl = `postgres://postgres:test@127.0.0.1:${dbPort}/monitor_e2e`;
const baseUrl = `http://localhost:${appPort}`;
const secret = 'invented-e2e-secret-0123456789abcdef';
const ownerId = '7770001';

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const cleanupDb = () => docker('rm', '--force', '--volumes', name);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = (script, args, env = {}) =>
    spawnSync(process.execPath, [fileURLToPath(new URL(`../node_modules/${script}`, import.meta.url)), ...args], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, ...env },
    }).status ?? 1;

async function waitFor(check, what) {
    for (let attempt = 0; attempt < 60; attempt++) {
        if (await check()) return;
        await sleep(500);
    }
    throw new Error(`${what} did not become ready in time.`);
}

let server = null;
let code = 1;
try {
    cleanupDb();
    const started = docker(
        'run', '--detach', '--name', name,
        '--publish', `127.0.0.1:${dbPort}:5432`,
        '--env', 'POSTGRES_PASSWORD=test',
        '--env', 'POSTGRES_DB=monitor_e2e',
        'postgres:17-alpine',
    );
    if (started.status !== 0) throw new Error('Could not start the Postgres container.');
    await waitFor(() => {
        const probe = docker('exec', name, 'psql', '-U', 'postgres', '-h', '127.0.0.1', '-d', 'monitor_e2e', '-tAc', 'select 1');
        return probe.status === 0 && probe.stdout.trim() === '1';
    }, 'Postgres');

    if (run('tsx/dist/cli.mjs', ['e2e/seed.ts'], { DATABASE_URL: databaseUrl }) !== 0) throw new Error('Could not seed the database.');

    cpSync(fileURLToPath(new URL('../.next/static', import.meta.url)), `${standalone}.next/static`, { recursive: true });
    server = spawn(process.execPath, ['server.js'], {
        cwd: standalone,
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_ENV: 'production',
            PORT: appPort,
            HOSTNAME: '127.0.0.1',
            DATABASE_URL: databaseUrl,
            NEXTAUTH_SECRET: secret,
            NEXTAUTH_URL: `https://localhost:${appPort}`,
            ALLOWED_GITHUB_USER_ID: ownerId,
            GITHUB_CLIENT_ID: 'invented-client-id',
            GITHUB_CLIENT_SECRET: 'invented-client-secret',
        },
    });
    await waitFor(async () => {
        try {
            return (await fetch(`${baseUrl}/health`)).ok;
        } catch {
            return false;
        }
    }, 'The app');

    const token = await encode({ token: { githubId: ownerId }, secret });
    code = run('@playwright/test/cli.js', ['test', ...process.argv.slice(2)], { E2E_BASE_URL: baseUrl, E2E_SESSION_TOKEN: token, E2E_DATABASE_URL: databaseUrl });
} catch (error) {
    console.error(error instanceof Error ? error.message : 'The check failed.');
} finally {
    server?.kill();
    cleanupDb();
}
process.exit(code);
