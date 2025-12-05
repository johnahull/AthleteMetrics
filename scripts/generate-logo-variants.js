#!/usr/bin/env node
/**
 * Generate logo variants using platform-specific source images
 * Uses sharp for high-quality image processing
 */

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = join(__dirname, '..');
const sourceIPhone = join(rootDir, 'am-logo-iphone.png');
const sourceAndroid = join(rootDir, 'am-logo-android.png');
const sourceNoBrandTransparent = join(rootDir, 'attached_assets/am-mobile-nobrand-transparent.png');
const sourceBrand = join(rootDir, 'attached_assets/am-mobile-brand-transparent.png');
const outputDir = join(rootDir, 'packages/web/public');

async function generateVariants() {
  console.log('🎨 Generating logo variants from platform-optimized sources');
  console.log('📁 Output directory:', outputDir);
  console.log('');

  // Use transparent runner icon for web icons (no white background)
  console.log('🔧 Generating web icons (transparent):');
  console.log(`   Source: am-mobile-nobrand-transparent.png`);

  await sharp(sourceNoBrandTransparent)
    .resize(192, 192, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(join(outputDir, 'icon-192.png'));
  console.log(`  ✅ icon-192.png (192x192) - PWA home screen icon (transparent)`);

  await sharp(sourceNoBrandTransparent)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(join(outputDir, 'icon-512.png'));
  console.log(`  ✅ icon-512.png (512x512) - PWA splash screen icon (transparent)`);

  await sharp(sourceNoBrandTransparent)
    .resize(64, 64, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(join(outputDir, 'logo-64.png'));
  console.log(`  ✅ logo-64.png (64x64) - Small icon (sidebar)`);

  console.log('');
  console.log('🔧 Generating full logo variants (with text):');
  console.log(`   Source: am-mobile-brand-transparent.png`);

  // Generate full logo variants (with text for website)
  await sharp(sourceBrand)
    .resize(128, 128, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(join(outputDir, 'logo-128.png'));
  console.log(`  ✅ logo-128.png (128x128) - Welcome page logo`);

  await sharp(sourceBrand)
    .resize(256, 256, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(join(outputDir, 'logo-256.png'));
  console.log(`  ✅ logo-256.png (256x256) - Large marketing logo`);

  console.log('');
  console.log('✨ All logo variants generated successfully!');
  console.log('');
  console.log('📋 Summary:');
  console.log('  Web icons (transparent): icon-192.png, icon-512.png, logo-64.png');
  console.log('  Full logo (with text): logo-128.png, logo-256.png');
  console.log('');
  console.log('ℹ️  Note: Web icons use transparent background for better web integration');
  console.log('   Platform-specific icons (with white containers) are available separately:');
  console.log('   - am-logo-iphone.png: iOS rounded square style');
  console.log('   - am-logo-android.png: Android circular style');
}

generateVariants().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
