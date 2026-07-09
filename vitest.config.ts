import {configDefaults, defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 10000,
    setupFiles: ['tests/setup.ts'],
    exclude: [...configDefaults.exclude, 'tests/smoke.test.ts'],
    coverage: {
      exclude: [...configDefaults.exclude, '*.js', 'tests/**/*.ts', 'src/types', 'scripts', 'templates'],
    }
  }
});