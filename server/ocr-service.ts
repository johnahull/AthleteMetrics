import Tesseract from 'tesseract.js';
import sharp from 'sharp';

export interface OCRResult {
  text: string;
  confidence: number;
  extractedData: ExtractedMeasurementData[];
  warnings: string[];
}

export interface ExtractedMeasurementData {
  firstName?: string;
  lastName?: string;
  metric?: string;
  value?: string;
  date?: string;
  age?: string;
  confidence: number;
  rawText: string;
}

export class OCRService {
  /**
   * Extract text from image using OCR
   */
  async extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
    try {
      // Preprocess image for better OCR accuracy
      const processedImage = await this.preprocessImage(imageBuffer);
      
      // Perform OCR
      const { data } = await Tesseract.recognize(processedImage, 'eng', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      const warnings: string[] = [];
      
      // Check OCR confidence
      if (data.confidence < 50) {
        warnings.push('Low OCR confidence - image may be blurry or unclear');
      }

      // Extract measurement data from the recognized text
      const extractedData = this.parseAthleteDataFromText(data.text);
      
      return {
        text: data.text,
        confidence: data.confidence,
        extractedData,
        warnings
      };
    } catch (error) {
      console.error('OCR Error:', error);
      throw new Error(`Failed to extract text from image: ${error}`);
    }
  }

  /**
   * Preprocess image for better OCR accuracy
   */
  private async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(imageBuffer)
        .greyscale() // Convert to grayscale
        .normalise() // Normalize contrast
        .sharpen() // Sharpen the image
        .png() // Convert to PNG for better OCR
        .toBuffer();
    } catch (error) {
      console.error('Image preprocessing error:', error);
      // Return original buffer if preprocessing fails
      return imageBuffer;
    }
  }

  /**
   * Parse athlete measurement data from extracted text
   */
  private parseAthleteDataFromText(text: string): ExtractedMeasurementData[] {
    const results: ExtractedMeasurementData[] = [];
    const lines = text.split('\n').filter(line => line.trim());
    
    // Common measurement patterns
    const patterns = {
      // Name patterns - look for "FirstName LastName" or "LastName, FirstName"
      name: [
        /([A-Z][a-z]+)\s+([A-Z][a-z]+)/g,
        /([A-Z][a-z]+),\s*([A-Z][a-z]+)/g
      ],
      // Time patterns - look for seconds (e.g., 4.35, 1:23.45)
      time: [
        /(\d{1,2}\.?\d{2,3})\s*s?e?c?/gi,
        /(\d{1,2}:\d{2}\.\d{2})/g,
        /(\d\.\d{2,3})/g
      ],
      // Measurement patterns
      verticalJump: /(?:vert|jump|vertical).*?(\d{1,2}(?:\.\d)?)\s*(?:in|inch|")/gi,
      fortyYard: /(?:40|forty).*?(?:yard|yd).*?(\d\.\d{2})/gi,
      tenYardFly: /(?:10|ten).*?(?:yard|yd).*?(?:fly|time).*?(\d\.\d{2})/gi,
      // Date patterns
      date: /(\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{4}-\d{2}-\d{2})/g,
      // Age patterns
      age: /(?:age|yrs?|years?).*?(\d{1,2})/gi
    };

    let currentData: Partial<ExtractedMeasurementData> = { confidence: 70 };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Try to extract names
      for (const namePattern of patterns.name) {
        const nameMatch = namePattern.exec(line);
        if (nameMatch) {
          // Handle "LastName, FirstName" format
          if (line.includes(',')) {
            currentData.lastName = nameMatch[1];
            currentData.firstName = nameMatch[2];
          } else {
            // Handle "FirstName LastName" format
            currentData.firstName = nameMatch[1];
            currentData.lastName = nameMatch[2];
          }
          currentData.rawText = line;
          break;
        }
      }

      // Try to extract measurements
      if (patterns.verticalJump.test(line)) {
        const match = patterns.verticalJump.exec(line);
        if (match) {
          const data: ExtractedMeasurementData = {
            ...currentData,
            metric: 'VERTICAL_JUMP',
            value: match[1],
            rawText: line,
            confidence: 80
          };
          results.push(data as ExtractedMeasurementData);
        }
      }

      if (patterns.fortyYard.test(line)) {
        const match = patterns.fortyYard.exec(line);
        if (match) {
          const data: ExtractedMeasurementData = {
            ...currentData,
            metric: 'DASH_40YD',
            value: match[1],
            rawText: line,
            confidence: 80
          };
          results.push(data as ExtractedMeasurementData);
        }
      }

      if (patterns.tenYardFly.test(line)) {
        const match = patterns.tenYardFly.exec(line);
        if (match) {
          const data: ExtractedMeasurementData = {
            ...currentData,
            metric: 'FLY10_TIME',
            value: match[1],
            rawText: line,
            confidence: 80
          };
          results.push(data as ExtractedMeasurementData);
        }
      }

      // Extract dates
      const dateMatch = patterns.date.exec(line);
      if (dateMatch) {
        currentData.date = this.normalizeDate(dateMatch[0]);
      }

      // Extract ages
      const ageMatch = patterns.age.exec(line);
      if (ageMatch) {
        currentData.age = ageMatch[1];
      }

      // Look for generic time patterns
      for (const timePattern of patterns.time) {
        const timeMatch = timePattern.exec(line);
        if (timeMatch && !results.some(r => r.rawText === line)) {
          // Try to infer measurement type from context
          let metric = 'UNKNOWN';
          const lowerLine = line.toLowerCase();
          
          if (lowerLine.includes('40') || lowerLine.includes('forty')) {
            metric = 'DASH_40YD';
          } else if (lowerLine.includes('10') || lowerLine.includes('ten')) {
            metric = 'FLY10_TIME';
          } else if (lowerLine.includes('sprint') || lowerLine.includes('dash')) {
            metric = 'DASH_40YD';
          }

          if (metric !== 'UNKNOWN') {
            const data: ExtractedMeasurementData = {
              ...currentData,
              metric,
              value: timeMatch[1],
              rawText: line,
              confidence: 60
            };
            results.push(data as ExtractedMeasurementData);
          }
        }
      }
    }

    return this.consolidateExtractedData(results);
  }

  /**
   * Normalize date format to YYYY-MM-DD
   */
  private normalizeDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return dateStr; // Return original if can't parse
      }
      return date.toISOString().split('T')[0];
    } catch {
      return dateStr;
    }
  }

  /**
   * Consolidate and clean up extracted data
   */
  private consolidateExtractedData(data: ExtractedMeasurementData[]): ExtractedMeasurementData[] {
    // Group by athlete (firstName + lastName combination)
    const grouped = new Map<string, ExtractedMeasurementData[]>();
    
    for (const item of data) {
      if (!item.firstName || !item.lastName) continue;
      
      const key = `${item.firstName}-${item.lastName}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    }

    // Consolidate data for each athlete
    const consolidated: ExtractedMeasurementData[] = [];
    
    for (const [athleteKey, measurements] of grouped) {
      // Get the most complete record for this athlete
      const baseRecord = measurements.reduce((best, current) => 
        (current.confidence > best.confidence) ? current : best
      );

      // Add all unique measurements for this athlete
      const uniqueMetrics = new Set<string>();
      for (const measurement of measurements) {
        if (measurement.metric && !uniqueMetrics.has(measurement.metric)) {
          uniqueMetrics.add(measurement.metric);
          consolidated.push({
            firstName: baseRecord.firstName,
            lastName: baseRecord.lastName,
            metric: measurement.metric,
            value: measurement.value,
            date: baseRecord.date || measurement.date,
            age: baseRecord.age || measurement.age,
            confidence: Math.max(baseRecord.confidence, measurement.confidence),
            rawText: measurement.rawText
          });
        }
      }
    }

    return consolidated;
  }

  /**
   * Convert extracted data to CSV format for import
   */
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
}

export const ocrService = new OCRService();