import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const staticDirs = ['css', 'js'];

function copyDir(source: string, target: string) {
  mkdirSync(target, { recursive: true });

  for (const entry of readdirSync(source)) {
    const sourcePath = join(source, entry);
    const targetPath = join(target, entry);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      copyDir(sourcePath, targetPath);
      continue;
    }

    copyFileSync(sourcePath, targetPath);
  }
}

function copyLegacyAssets(): Plugin {
  return {
    name: 'copy-legacy-assets',
    apply: 'build',
    closeBundle() {
      for (const dir of staticDirs) {
        copyDir(dir, join('dist', basename(dir)));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyLegacyAssets()],
  build: {
    rollupOptions: {
      input: {
        testDesktop: 'test-desktop.html',
      },
    },
  },
});
