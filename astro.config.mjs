// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Static output only (Locked Decision #2). No View Transitions in v1.
// Site URL feeds the sitemap, canonical links and Open Graph URLs.
export default defineConfig({
  site: 'https://rajatarora.com',
  output: 'static',
  // ASTRO_OUT_DIR lets parallel local builds (and tests) use separate output
  // folders. CI and Vercel use the default `dist`.
  outDir: process.env.ASTRO_OUT_DIR ?? './dist',
  trailingSlash: 'never',
  integrations: [react(), sitemap()],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      // Keep chunk names stable so size-limit can target the Voyage island.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/gsap') || id.includes('node_modules/@gsap')) return 'gsap';
          },
        },
      },
    },
  },
});
