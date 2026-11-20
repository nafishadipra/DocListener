import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Dedicated Vite config for the content script.
 * Chrome's scripting.executeScript injects classic scripts, so bundling as a
 * single IIFE ensures Readability and helpers work without runtime imports.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      name: 'DocListenerContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
