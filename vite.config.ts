import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';
import {defineConfig} from 'vite';

/**
 * Preserve original material texture dimensions but compress to JPEG at build
 * time. Files in public/assets/materials are source WebP assets; the deployed
 * material JPEGs are generated once, then cached by browsers.
 * No image encode/decode is performed while entering the 3D editor.
 */
function prepareMaterialJpegs() {
  const dir=path.resolve(__dirname,'public/assets/materials');
  if (!fs.existsSync(dir)) return;
  for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.webp'))) {
    const input=path.join(dir,name),output=path.join(dir,name.replace(/\.webp$/i,'.jpg'));
    if (fs.existsSync(output) && fs.statSync(output).mtimeMs >= fs.statSync(input).mtimeMs) continue;
    let result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
      '-i',input,'-frames:v','1','-q:v','6',output],{encoding:'utf8'});
    if(result.status !== 0){
      result=spawnSync('magick',[input,'-strip','-sampling-factor','4:4:4',
        '-quality','82',output],{encoding:'utf8'});
    }
    if(result.status !== 0 || !fs.existsSync(output)) {
      // Developer machines without converters can continue using the original
      // WebP via the TextureLoader fallback. CI has ffmpeg installed.
      console.warn('Material JPEG conversion skipped (ffmpeg unavailable): '+name);
    }
  }
}

export default defineConfig(() => {
  return {
    base: '/kitchyar/',
    define: { __BUILD_VERSION__: JSON.stringify(process.env.GITHUB_SHA || `local-${new Date().toISOString()}`) },
    plugins: [
      { name:'prepare-compressed-jpg-materials',
        buildStart(){ prepareMaterialJpegs(); },
        configureServer(){ prepareMaterialJpegs(); },
      },
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

