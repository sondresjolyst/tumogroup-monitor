import { build } from 'esbuild';

// pg is CommonJS and calls require for Node's own modules, which an ES module does not have.
// The import has its own name, because bundled code imports createRequire too.
const banner = "import { createRequire as createBannerRequire } from 'node:module';\nconst require = createBannerRequire(import.meta.url);";

await build({
    entryPoints: ['src/job/main.ts'],
    outfile: 'job/refresh.mjs',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    tsconfig: 'tsconfig.json',
    external: ['pg-native'],
    banner: { js: banner },
    logLevel: 'warning',
});
