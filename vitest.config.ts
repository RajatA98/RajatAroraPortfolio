/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig lets Vitest use Astro's Vite setup, which is what makes the
// Astro Container API (render a component to a string) work inside unit tests.
export default getViteConfig({
  test: {
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
});
