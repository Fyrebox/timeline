// Rasterize the master SVG into the PNG icons the PWA manifest needs.
// Run: npm run icons   (dev-only; generated PNGs are committed)
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const outDir = path.join(root, 'public/icons');

const targets = [
  { file: 'icon-192.png', size: 192, src: 'assets/icon-master.svg' },
  { file: 'icon-512.png', size: 512, src: 'assets/icon-master.svg' },
  { file: 'apple-touch-icon.png', size: 180, src: 'assets/icon-master.svg' },
  { file: 'favicon-32.png', size: 32, src: 'public/icons/logo.svg' }
];

for (const t of targets) {
  const svg = await readFile(path.join(root, t.src));
  await sharp(svg, { density: 384 })
    .resize(t.size, t.size)
    .png()
    .toFile(path.join(outDir, t.file));
  console.log(`[icons] wrote ${t.file} (${t.size}px)`);
}
console.log('[icons] done.');
