import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Ensures relative assets work in Electron loadFile
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
