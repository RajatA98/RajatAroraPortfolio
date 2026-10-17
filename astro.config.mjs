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
  // Content Security Policy, enforced. Astro hashes every inline script and
  // style it emits (island hydration, the copy helper, Speed Insights, inlined
  // stylesheets) into a <meta http-equiv> tag, so no 'unsafe-inline' is
  // needed. Directives a meta tag cannot carry (frame-ancestors) stay in the
  // vercel.json header.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
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
            if (id.includes('node_modules/three')) return 'three';
            // The gate and the loader get their own small chunk so the island
            // entry never statically imports the scene chunk (and Three.js):
            // that loads only through the loader's dynamic import.
            if (/\/src\/components\/scene\/(mount|loader)\./.test(id)) return 'scene-gate';
            if (id.includes('/src/components/scene/') && !id.includes('/Voyage3D.')) return 'scene';
          },
        },
      },
    },
  },
});
