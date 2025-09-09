import Tesseract from 'tesseract.js';
import { OCRConfig } from '@shared/ocr-types';

export interface TextExtractionResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
}

export class TextExtractor {
  constructor(private config: OCRConfig) {}

  async extractText(imageBuffer: Buffer): Promise<TextExtractionResult> {
    try {
      console.log('Starting OCR text extraction...');
      
      const startTime = Date.now();
      const { data } = await Tesseract.recognize(imageBuffer, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      const extractionTime = Date.now() - startTime;
      console.log(`OCR extraction completed in ${extractionTime}ms with ${data.confidence.toFixed(1)}% confidence`);
      
      // Extract word-level information for better debugging
      const words = (data as any).words?.map((word: any) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: {
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1,
        }
      })) || [];

      return {
        text: data.text,
        confidence: data.confidence,
        words,
      };
    } catch (error) {
      console.error('OCR text extraction error:', error);
      throw new Error(`Failed to extract text from image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async extractTextWithRetry(
    imageBuffer: Buffer, 
    maxRetries: number = 2
  ): Promise<TextExtractionResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        console.log(`OCR attempt ${attempt}/${maxRetries + 1}`);
        const result = await this.extractText(imageBuffer);
        
        // Check if confidence is acceptable
        if (result.confidence >= this.config.confidenceThreshold) {
          return result;
        }
        
        if (attempt <= maxRetries) {
          console.log(`Low confidence (${result.confidence.toFixed(1)}%), retrying...`);
          // Add small delay between retries
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        // Return result even if confidence is low on final attempt
        console.warn(`Final attempt resulted in low confidence: ${result.confidence.toFixed(1)}%`);
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt <= maxRetries) {
          console.log(`OCR attempt ${attempt} failed, retrying: ${lastError.message}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    throw lastError || new Error('All OCR attempts failed');
  }

  validateTextQuality(result: TextExtractionResult): {
    quality: 'high' | 'medium' | 'low';
    warnings: string[];
  } {
    const warnings: string[] = [];
    let quality: 'high' | 'medium' | 'low' = 'high';

    // Check overall confidence
    if (result.confidence < 30) {
      quality = 'low';
      warnings.push('Very low OCR confidence - image may be blurry or unclear');
    } else if (result.confidence < 60) {
      quality = 'medium';
      warnings.push('Low OCR confidence - results may be inaccurate');
    }

    // Check text length
    if (result.text.trim().length < 10) {
      quality = 'low';
      warnings.push('Very little text extracted - image may be blank or unclear');
    }

    // Check for garbled text (many single characters or short words)
    const words = result.text.split(/\s+/).filter(word => word.length > 0);
    const shortWords = words.filter(word => word.length <= 2);
    const shortWordRatio = shortWords.length / Math.max(words.length, 1);
    
    if (shortWordRatio > 0.7) {
      quality = 'low';
      warnings.push('Text appears garbled - many very short words detected');
    }

    // Check word-level confidence if available
    if (result.words.length > 0) {
      const lowConfidenceWords = result.words.filter(word => word.confidence < 50);
      const lowConfidenceRatio = lowConfidenceWords.length / result.words.length;
      
      if (lowConfidenceRatio > 0.5) {
        quality = quality === 'high' ? 'medium' : 'low';
        warnings.push('Many words have low confidence - consider using a clearer image');
      }
    }

    console.log(`Text quality assessment: ${quality} (${warnings.length} warnings)`);
    return { quality, warnings };
  }
}