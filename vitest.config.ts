import {configDefaults, defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 10000,
    setupFiles: ['tests/setup.ts'],
    exclude: [...configDefaults.exclude, 'tests/smoke.test.ts', 'e2e/**'],
    coverage: {
      exclude: [...configDefaults.exclude, '*.js', 'tests/**/*.ts', 'e2e/**', 'src/types', 'scripts', 'templates'],
    }
  }
});