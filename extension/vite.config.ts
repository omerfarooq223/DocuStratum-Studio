import { defineConfig, build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

// Helper plugin to bundle content.js as a standalone IIFE and copy manifest.json
function extensionPlugins() {
  return {
    name: 'extension-plugins',
    async closeBundle() {
      // Build content script as an isolated, standalone IIFE (no ES module imports)
      await build({
        configFile: false,
        build: {
          emptyOutDir: false,
          outDir: resolve(import.meta.dirname, 'dist'),
          rollupOptions: {
            input: resolve(import.meta.dirname, 'src/content/index.ts'),
            output: {
              format: 'iife',
              entryFileNames: 'content.js',
              name: 'WebRAGContentScript',
              extend: true
            }
          }
        }
      });

      // Copy manifest.json to dist
      fs.copyFileSync(
        resolve(import.meta.dirname, 'manifest.json'),
        resolve(import.meta.dirname, 'dist/manifest.json')
      );

      // Copy public assets to dist root if present
      const publicDir = resolve(import.meta.dirname, 'public');
      if (fs.existsSync(publicDir)) {
        fs.cpSync(publicDir, resolve(import.meta.dirname, 'dist'), { recursive: true });
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), extensionPlugins()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/capture/__tests__/setup.ts']
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, 'src/sidepanel/index.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        }
      }
    }
  }
});
