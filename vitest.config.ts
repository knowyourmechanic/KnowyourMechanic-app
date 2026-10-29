import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Test config kept separate from vite.config.ts so the production build stays
// untouched. jsdom gives the tests a browser-like window/navigator/localStorage,
// which the share, i18n and hours helpers rely on.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,            // tests import { describe, it, expect } explicitly
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Coverage focuses on the pure logic we actually test; UI pages and
      // generated types would only dilute the number.
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/database.types.ts', 'src/**/*.test.*'],
    },
  },
})
