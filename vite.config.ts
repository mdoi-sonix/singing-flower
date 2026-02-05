import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/singing-flower/',
  build: {
    outDir: 'docs'
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
});
