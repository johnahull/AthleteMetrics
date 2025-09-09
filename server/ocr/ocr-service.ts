import { OCRResult, OCRConfig, ExtractedMeasurementData, ocrConfigSchema } from '@shared/ocr-types';
import { ImagePreprocessor } from './processors/image-preprocessor';
import { TextExtractor } from './processors/text-extractor';
import { DataParser } from './processors/data-parser';
import { MeasurementValidator } from './validators/measurement-validator';

export class OCRService {
  private config: OCRConfig;
  private imagePreprocessor: ImagePreprocessor;
  private textExtractor: TextExtractor;
  private dataParser: DataParser;
  private measurementValidator: MeasurementValidator;
  private imageCache = new Map<string, Buffer>(); // Simple in-memory cache

  constructor(config?: Partial<OCRConfig>) {
    // Validate and set configuration with defaults
    this.config = ocrConfigSchema.parse(config || {});
    console.log('OCR Service initialized with config:', JSON.stringify(this.config, null, 2));
    
    // Initialize processors
    this.imagePreprocessor = new ImagePreprocessor(this.config);
    this.textExtractor = new TextExtractor(this.config);
    this.dataParser = new DataParser(this.config);
    this.measurementValidator = new MeasurementValidator(this.config);
  }

  async extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
    const startTime = Date.now();
    console.log(`Starting OCR processing for ${imageBuffer.length} byte image`);
    
    try {
      // Step 1: Validate image
      const imageValidation = await this.imagePreprocessor.validateImage(imageBuffer);
      if (!imageValidation.valid) {
        throw new Error(`Invalid image: ${imageValidation.error || 'Unknown validation error'}`);
      }

      // Step 2: Check cache
      const imageHash = this.hashBuffer(imageBuffer);
      let processedImage = this.imageCache.get(imageHash) || null;
      
      if (!processedImage) {
        // Step 3: Preprocess image
        processedImage = await this.imagePreprocessor.preprocessImage(imageBuffer);
        
        // Cache the processed image (limit cache size)
        if (this.imageCache.size >= 10) {
          const firstKey = this.imageCache.keys().next().value;
          this.imageCache.delete(firstKey);
        }
        this.imageCache.set(imageHash, processedImage);
        console.log('Processed image cached');
      } else {
        console.log('Using cached processed image');
      }

      // Step 4: Extract text
      const textResult = await this.textExtractor.extractTextWithRetry(processedImage);
      
      // Step 5: Validate text quality
      const textQuality = this.textExtractor.validateTextQuality(textResult);
      const warnings = [...textQuality.warnings];
      
      // Step 6: Parse athlete data
      const parsingResult = this.dataParser.parseAthleteData(textResult.text);
      
      // Step 7: Validate measurements
      const validationResult = this.measurementValidator.validateBatch(parsingResult.extractedData);
      
      // Add validation warnings
      for (const invalid of validationResult.invalid) {
        warnings.push(`Invalid measurement: ${invalid.validation.errors.join(', ')}`);
      }

      const totalTime = Date.now() - startTime;
      console.log(`OCR processing completed in ${totalTime}ms:`);
      console.log(`- Text confidence: ${textResult.confidence.toFixed(1)}%`);
      console.log(`- Raw measurements: ${parsingResult.extractedData.length}`);
      console.log(`- Valid measurements: ${validationResult.valid.length}`);
      console.log(`- Invalid measurements: ${validationResult.invalid.length}`);
      console.log(`- Total warnings: ${warnings.length}`);
      
      return {
        text: textResult.text,
        confidence: textResult.confidence,
        extractedData: validationResult.valid,
        warnings
      };
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`OCR processing failed after ${totalTime}ms:`, error);
      throw new Error(`Failed to extract text from image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processMultipleImages(imageBuffers: Buffer[]): Promise<OCRResult[]> {
    console.log(`Processing ${imageBuffers.length} images in parallel...`);
    
    try {
      // Process all images in parallel
      const promises = imageBuffers.map(buffer => this.extractTextFromImage(buffer));
      const results = await Promise.all(promises);
      
      console.log(`Parallel processing completed. Processed ${results.length} images.`);
      return results;
      
    } catch (error) {
      console.error('Batch OCR processing error:', error);
      throw new Error(`Failed to process multiple images: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  convertToCSVFormat(extractedData: ExtractedMeasurementData[]): string {
    if (extractedData.length === 0) return '';

    const headers = ['firstName', 'lastName', 'metric', 'value', 'date', 'age', 'confidence', 'rawText'];
    const headerRow = headers.join(',');

    const rows = extractedData.map(data => {
      return headers.map(header => {
        const value = data[header as keyof ExtractedMeasurementData] || '';
        // Escape commas and quotes for CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });

    return [headerRow, ...rows].join('\n');
  }

  updateConfig(newConfig: Partial<OCRConfig>): void {
    this.config = ocrConfigSchema.parse({ ...this.config, ...newConfig });
    console.log('OCR Service configuration updated');
    
    // Reinitialize processors with new config
    this.imagePreprocessor = new ImagePreprocessor(this.config);
    this.textExtractor = new TextExtractor(this.config);
    this.dataParser = new DataParser(this.config);
    this.measurementValidator = new MeasurementValidator(this.config);
  }

  getConfig(): OCRConfig {
    return { ...this.config }; // Return copy to prevent mutations
  }

  clearCache(): void {
    this.imageCache.clear();
    console.log('OCR image cache cleared');
  }

  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.imageCache.size,
      maxSize: 10
    };
  }

  private hashBuffer(buffer: Buffer): string {
    // Simple hash function for caching
    let hash = 0;
    for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
      const char = buffer[i];
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${hash}_${buffer.length}`;
  }
}

// Create singleton instance with default config
export const ocrService = new OCRService();

// Export factory function for custom configurations
export function createOCRService(config?: Partial<OCRConfig>): OCRService {
  return new OCRService(config);
}