import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './src/main.ts'
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
});
