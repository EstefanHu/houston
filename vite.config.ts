import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so dist/ works at a domain root or under /houston/.
  base: './',
  build: {
    // three.js alone is ~580 kB minified (~150 kB gzipped), well inside the 10 MB budget.
    chunkSizeWarningLimit: 800,
  },
});
