#!/usr/bin/env node

/**
 * Generate favicon / PWA / apple-touch icons from the runner logo.
 * The raster master is only ~250px of runner, so it is traced to a vector
 * (potrace) and every size is rendered from that path: sharp at any size, no
 * upscaling. A blur before tracing drops the thin circuit lines and specks,
 * which turn to noise at tab size, leaving the dissolving-runner silhouette.
 * Run from the repo root: node scripts/generate-pwa-icons.cjs
 */

const sharp = require('sharp');
const potrace = require('potrace');
const path = require('path');
const fs = require('fs');

const master = path.resolve(__dirname, 'icon-source/runner-master.png');
const publicDir = path.resolve(__dirname, '../packages/web/public');
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// glyph = share of the canvas the longer glyph side fills; maskable needs the
// glyph inside the 80% safe circle, so it gets a smaller share on a solid bg
const targets = [
  { file: 'favicon.png', size: 64, glyph: 0.96, background: WHITE },
  { file: 'icon-192.png', size: 192, glyph: 0.92, background: CLEAR },
  { file: 'icon-512.png', size: 512, glyph: 0.92, background: CLEAR },
  { file: 'icon-maskable-192.png', size: 192, glyph: 0.62, background: WHITE },
  { file: 'icon-maskable-512.png', size: 512, glyph: 0.62, background: WHITE },
  // iOS paints transparency black, so this one must be opaque
  { file: 'apple-touch-icon.png', size: 180, glyph: 0.8, background: WHITE },
];

const TRACE_WIDTH = 1600;

const traceRunner = async () => {
  const big = await sharp(master).trim().resize({ width: TRACE_WIDTH }).toBuffer();
  const mask = await sharp(big).extractChannel('alpha').blur(14).negate().threshold(60).png().toBuffer();
  const svg = await new Promise((resolve, reject) =>
    potrace.trace(mask, { turdSize: 1500, optTolerance: 0.4 }, (err, out) => (err ? reject(err) : resolve(out)))
  );
  const [, width, height] = svg.match(/width="(\d+)" height="(\d+)"/).map(Number);
  const d = svg.match(/<path d="([^"]+)"/)[1];
  return { width, height, d };
};

// width/height are the rendered size; the viewBox keeps the traced coordinates
const runnerSvg = ({ width, height, d }, renderW, renderH) => `<svg xmlns="http://www.w3.org/2000/svg" width="${renderW}" height="${renderH}" viewBox="0 0 ${width} ${height}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e40af"/><stop offset="0.55" stop-color="#dc2626"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs>
<path d="${d}" fill="url(#g)" fill-rule="evenodd"/></svg>`;

async function generateIcons() {
  const runner = await traceRunner();
  const aspect = runner.width / runner.height;

  for (const { file, size, glyph, background } of targets) {
    const inner = Math.round(size * glyph);
    const w = aspect >= 1 ? inner : Math.round(inner * aspect);
    const h = aspect >= 1 ? Math.round(inner / aspect) : inner;
    // render at 2x then downsample for smooth edges on the small sizes
    const logo = await sharp(Buffer.from(runnerSvg(runner, w * 2, h * 2)))
      .resize(w, h, { kernel: 'lanczos3' })
      .toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background } })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toFile(path.join(publicDir, file));
    console.log(`Generated: ${file}`);
  }

  // Sharp-at-any-size tab icon; opaque white tile so it shows on dark tab strips
  const pad = Math.round(runner.width * 0.04);
  const side = runner.width + pad * 2;
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}">
<rect width="${side}" height="${side}" rx="${Math.round(side * 0.18)}" fill="#fff"/>
<g transform="translate(${pad} ${pad + Math.round((runner.width - runner.height) / 2)})">${runnerSvg(runner, runner.width, runner.height).replace(/^<svg[^>]*>/, '').replace('</svg>', '')}</g></svg>`;
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg);
  console.log('Generated: favicon.svg');
}

generateIcons().catch((err) => {
  console.error(err);
  process.exit(1);
});
