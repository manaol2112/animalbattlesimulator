import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // Relative paths so the build runs from any static host or subfolder.
  base: './',
  build: {
    // Three.js is one large dependency by nature; splitting it wouldn't help load time.
    chunkSizeWarningLimit: 1200,
    // `single` mode folds fonts into the CSS so the game can ship as one self-contained page.
    ...(mode === 'single' ? { assetsInlineLimit: 100_000_000, outDir: 'dist-single' } : {}),
  },
  test: { include: ['tests/**/*.test.ts'] },
}) as never);
