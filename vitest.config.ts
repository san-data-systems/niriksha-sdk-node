import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 80,
        // Signal handlers and diag logger callbacks in index.ts are runtime
        // infrastructure that cannot be safely triggered in unit tests.
        // 70% matches the branch threshold as the floor for helper/infra code.
        functions: 70,
        branches: 70,
        statements: 80,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/internal/**'],
    },
  },
})
