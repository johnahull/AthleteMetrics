#!/usr/bin/env node

/**
 * Generate favicon / PWA / apple-touch icons from the runner logo.
 * The master has wide transparent margins, so the glyph is trimmed and re-padded
 * to fill most of each canvas; otherwise browsers shrink it to a speck at 16px.
 * The master's runner is ~250px, so only the 512px icon is upscaled (~1.8x).
 * Run from the repo root: node scripts/generate-pwa-icons.cjs
 */

const sharp = require('sharp');
const path = require('path');

const master = path.resolve(__dirname, 'icon-source/runner-master.png');
const publicDir = path.resolve(__dirname, '../packages/web/public');
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 255, g: 255, b: 255, alpha: 0 };

// glyph = share of the canvas the longer glyph side fills. Maskable needs the
// glyph inside the 40%-radius safe circle: the trimmed runner is 251x207, so at
// 0.6 its corners sit ~38.9% from centre (0.62 would be ~40.2%, just outside).
const targets = [
  { file: 'favicon.png', size: 64, glyph: 0.94, background: WHITE },
  { file: 'icon-192.png', size: 192, glyph: 0.9, background: CLEAR },
  { file: 'icon-512.png', size: 512, glyph: 0.9, background: CLEAR },
  { file: 'icon-maskable-192.png', size: 192, glyph: 0.6, background: WHITE },
  { file: 'icon-maskable-512.png', size: 512, glyph: 0.6, background: WHITE },
  // iOS paints transparency black, so this one must be opaque
  { file: 'apple-touch-icon.png', size: 180, glyph: 0.8, background: WHITE },
];

async function generateIcons() {
  const trimmed = await sharp(master).trim().toBuffer();

  for (const { file, size, glyph, background } of targets) {
    const inner = Math.round(size * glyph);
    const logo = await sharp(trimmed)
      .resize(inner, inner, { fit: 'inside', kernel: 'lanczos3' })
      .toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background } })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toFile(path.join(publicDir, file));
    console.log(`Generated: ${file}`);
  }
}

generateIcons().catch((err) => {
  console.error(err);
  process.exit(1);
});
