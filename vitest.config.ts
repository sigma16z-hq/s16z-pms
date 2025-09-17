import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.vitest.json', './tsconfig.json'] })],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'apps/**/*.spec.ts',
      'apps/**/*.test.ts',
      'libs/**/*.spec.ts',
      'libs/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', 'dist/**', 'coverage/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
    testTimeout: 120_000,
    hookTimeout: 120_000,
    threads: false,
  },
});
