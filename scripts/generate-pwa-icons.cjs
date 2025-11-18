#!/usr/bin/env node

/**
 * Generate PNG icons from SVG for PWA compatibility
 * Safari and older browsers need PNG fallbacks
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const publicDir = path.resolve(__dirname, '../packages/web/public');

async function generateIcons() {
  const sizes = [192, 512];

  for (const size of sizes) {
    const svgPath = path.join(publicDir, `icon-${size}.svg`);
    const pngPath = path.join(publicDir, `icon-${size}.png`);

    if (!fs.existsSync(svgPath)) {
      console.error(`SVG not found: ${svgPath}`);
      continue;
    }

    try {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(pngPath);

      console.log(`Generated: icon-${size}.png`);
    } catch (error) {
      console.error(`Failed to generate icon-${size}.png:`, error.message);
    }
  }

  console.log('PWA icon generation complete');
}

generateIcons().catch(console.error);
