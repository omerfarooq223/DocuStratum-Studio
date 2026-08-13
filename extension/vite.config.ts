import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

// Helper plugin to copy manifest.json to dist
function copyManifest() {
  return {
    name: 'copy-manifest',
    closeBundle() {
      fs.copyFileSync(
        resolve(import.meta.dirname, 'manifest.json'),
        resolve(import.meta.dirname, 'dist/manifest.json')
      );
    }
  };
}

export default defineConfig({
  plugins: [react(), copyManifest()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/capture/__tests__/setup.ts']
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, 'src/sidepanel/index.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
        content: resolve(import.meta.dirname, 'src/content/index.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background' || chunkInfo.name === 'content') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        }
      }
    }
  }
});
