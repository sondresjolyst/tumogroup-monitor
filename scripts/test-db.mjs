import { spawnSync } from 'node:child_process';

const name = 'tumogroup-monitor-test-db';
const port = '54329';
const url = `postgres://postgres:test@127.0.0.1:${port}/monitor_test`;

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });

const cleanup = () => {
    docker('rm', '--force', '--volumes', name);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

cleanup();
const started = docker(
    'run', '--detach', '--name', name,
    '--publish', `127.0.0.1:${port}:5432`,
    '--env', 'POSTGRES_PASSWORD=test',
    '--env', 'POSTGRES_DB=monitor_test',
    'postgres:17-alpine',
);
if (started.status !== 0) {
    console.error(started.stderr);
    process.exit(1);
}

let code = 1;
try {
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
        const probe = docker('exec', name, 'psql', '-U', 'postgres', '-h', '127.0.0.1', '-d', 'monitor_test', '-tAc', 'select 1');
        ready = probe.status === 0 && probe.stdout.trim() === '1';
        if (!ready) await sleep(500);
    }
    if (!ready) {
        console.error('Postgres did not become ready in time.');
    } else {
        const run = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.db.config.mts'], {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env, TEST_DATABASE_URL: url },
        });
        code = run.status ?? 1;
    }
} finally {
    cleanup();
}
process.exit(code);
