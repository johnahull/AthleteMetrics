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
const sourceBrand = join(rootDir, 'attached_assets/am-mobile-brand-transparent.png');
const outputDir = join(rootDir, 'packages/web/public');

async function generateVariants() {
  console.log('🎨 Generating logo variants from platform-optimized sources');
  console.log('📁 Output directory:', outputDir);
  console.log('');

  // Use the professional platform-specific icons
  // These already have the proper containers and perfect sizing
  console.log('🔧 Generating PWA icons:');

  // iPhone icon for iOS (already has rounded square container)
  console.log(`   iOS Source: am-logo-iphone.png`);
  await sharp(sourceIPhone)
    .resize(192, 192, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(join(outputDir, 'icon-192.png'));
  console.log(`  ✅ icon-192.png (192x192) - PWA home screen icon (iOS optimized)`);

  await sharp(sourceIPhone)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(join(outputDir, 'icon-512.png'));
  console.log(`  ✅ icon-512.png (512x512) - PWA splash screen icon (iOS optimized)`);

  // Small icon for sidebar (use iPhone version)
  await sharp(sourceIPhone)
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
  console.log('  PWA icons (platform-optimized): icon-192.png, icon-512.png, logo-64.png');
  console.log('  Full logo (with text): logo-128.png, logo-256.png');
  console.log('');
  console.log('ℹ️  Note: PWA icons use professionally designed platform-specific versions');
  console.log('   - iOS: Rounded square container with perfect runner sizing');
  console.log('   - Android: Circular container with perfect runner sizing');
}

generateVariants().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
