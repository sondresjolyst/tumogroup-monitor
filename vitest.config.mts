import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['src/**/*.test.{ts,tsx}'],
        exclude: ['node_modules/**', 'src/lib/db/store.test.ts'],
        server: { deps: { inline: ['@sjolystinnovation/app-kit'] } },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
});
