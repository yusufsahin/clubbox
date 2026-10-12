import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Copy Agora AI denoiser WASM into public/ so Electron can load it same-origin. */
function copyAgoraDenoiserAssets(): Plugin {
  const srcDir = path.resolve('node_modules/agora-extension-ai-denoiser/external');
  const destDir = path.resolve('public/agora-denoiser');
  const copy = () => {
    if (!fs.existsSync(srcDir)) return;
    fs.mkdirSync(destDir, { recursive: true });
    for (const name of fs.readdirSync(srcDir)) {
      fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
    }
  };
  return {
    name: 'copy-agora-denoiser-assets',
    buildStart() {
      copy();
    },
    configureServer() {
      copy();
    },
  };
}

export default defineConfig({
  base: './', // Ensures relative assets work in Electron loadFile
  plugins: [copyAgoraDenoiserAssets()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
