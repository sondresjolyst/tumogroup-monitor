import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules/**', 'src/lib/db/**'],
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
});
