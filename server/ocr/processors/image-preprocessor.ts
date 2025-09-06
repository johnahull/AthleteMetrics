import sharp from 'sharp';
import { OCRConfig } from '@shared/ocr-types';

export class ImagePreprocessor {
  constructor(private config: OCRConfig) {}

  async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    if (!this.config.imageProcessing.enabled) {
      console.log('Image preprocessing disabled, returning original buffer');
      return imageBuffer;
    }

    try {
      console.log('Starting image preprocessing...');
      let pipeline = sharp(imageBuffer);

      // Apply preprocessing steps based on configuration
      if (this.config.imageProcessing.greyscale) {
        console.log('Converting to greyscale');
        pipeline = pipeline.greyscale();
      }

      if (this.config.imageProcessing.normalize) {
        console.log('Normalizing contrast');
        pipeline = pipeline.normalise();
      }

      if (this.config.imageProcessing.sharpen) {
        console.log('Sharpening image');
        pipeline = pipeline.sharpen();
      }

      // Convert to PNG for better OCR compatibility
      if (this.config.imageProcessing.convertToPng) {
        console.log('Converting to PNG format');
        pipeline = pipeline.png();
      }

      const processedBuffer = await pipeline.toBuffer();
      console.log(`Image preprocessing completed. Original: ${imageBuffer.length} bytes, Processed: ${processedBuffer.length} bytes`);
      
      return processedBuffer;
    } catch (error) {
      console.error('Image preprocessing error:', error);
      console.log('Falling back to original image buffer');
      return imageBuffer;
    }
  }

  async validateImage(imageBuffer: Buffer): Promise<{ valid: boolean; error?: string }> {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      
      // Check image dimensions
      if (!metadata.width || !metadata.height) {
        return { valid: false, error: 'Unable to determine image dimensions' };
      }

      // Check if image is too small
      if (metadata.width < 100 || metadata.height < 100) {
        return { valid: false, error: 'Image too small (minimum 100x100 pixels)' };
      }

      // Check if image is too large
      if (metadata.width > 10000 || metadata.height > 10000) {
        return { valid: false, error: 'Image too large (maximum 10000x10000 pixels)' };
      }

      // Check format
      if (!metadata.format) {
        return { valid: false, error: 'Unable to determine image format' };
      }

      const supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'tiff'];
      if (!supportedFormats.includes(metadata.format.toLowerCase())) {
        return { valid: false, error: `Unsupported format: ${metadata.format}` };
      }

      console.log(`Image validation passed: ${metadata.width}x${metadata.height} ${metadata.format}`);
      return { valid: true };
    } catch (error) {
      console.error('Image validation error:', error);
      return { valid: false, error: 'Invalid or corrupted image file' };
    }
  }

  async getImageInfo(imageBuffer: Buffer): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
    hasAlpha: boolean;
  }> {
    const metadata = await sharp(imageBuffer).metadata();
    
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      size: imageBuffer.length,
      hasAlpha: metadata.hasAlpha || false,
    };
  }
}