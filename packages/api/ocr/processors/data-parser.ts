import { ExtractedMeasurementData, OCRConfig } from '@shared/ocr-types';
import { 
  MEASUREMENT_PATTERNS, 
  NAME_PATTERNS, 
  DATE_PATTERNS, 
  AGE_PATTERNS, 
  TIME_PATTERNS,
  getPatternConfig 
} from '../patterns/measurement-patterns';

export interface ParsingResult {
  extractedData: ExtractedMeasurementData[];
  debugInfo: {
    totalLines: number;
    processedLines: number;
    patternsMatched: Record<string, number>;
  };
}

export class DataParser {
  constructor(private config: OCRConfig) {}

  parseAthleteData(text: string): ParsingResult {
    console.log('Starting data parsing...');
    const startTime = Date.now();
    
    const results: ExtractedMeasurementData[] = [];
    const lines = text.split('\n').filter(line => line.trim());
    const debugInfo = {
      totalLines: lines.length,
      processedLines: 0,
      patternsMatched: {} as Record<string, number>
    };

    let currentContext: Partial<ExtractedMeasurementData> = { confidence: 70 };
    
    console.log(`Processing ${lines.length} lines of text...`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      debugInfo.processedLines++;
      console.log(`Processing line ${i + 1}: "${line.substring(0, 50)}${line.length > 50 ? '...' : ''}"`);

      // Extract names first as they provide context for measurements
      const nameData = this.extractNames(line);
      if (nameData) {
        currentContext = { ...currentContext, ...nameData, rawText: line };
        debugInfo.patternsMatched['names'] = (debugInfo.patternsMatched['names'] || 0) + 1;
        console.log(`Found name: ${nameData.firstName} ${nameData.lastName}`);
      }

      // Extract dates and ages for context
      const dateData = this.extractDate(line);
      if (dateData) {
        currentContext.date = dateData;
        debugInfo.patternsMatched['dates'] = (debugInfo.patternsMatched['dates'] || 0) + 1;
        console.log(`Found date: ${dateData}`);
      }

      const ageData = this.extractAge(line);
      if (ageData) {
        currentContext.age = ageData;
        debugInfo.patternsMatched['ages'] = (debugInfo.patternsMatched['ages'] || 0) + 1;
        console.log(`Found age: ${ageData}`);
      }

      // Extract specific measurements
      const measurements = this.extractMeasurements(line, currentContext);
      results.push(...measurements);
      
      if (measurements.length > 0) {
        measurements.forEach(m => {
          debugInfo.patternsMatched[m.metric || 'unknown'] = 
            (debugInfo.patternsMatched[m.metric || 'unknown'] || 0) + 1;
        });
      }

      // Try generic time patterns if no specific measurements found
      if (measurements.length === 0) {
        const genericTimes = this.extractGenericTimes(line, currentContext);
        results.push(...genericTimes);
        
        if (genericTimes.length > 0) {
          genericTimes.forEach(t => {
            debugInfo.patternsMatched[t.metric || 'generic'] = 
              (debugInfo.patternsMatched[t.metric || 'generic'] || 0) + 1;
          });
        }
      }
    }

    const consolidated = this.consolidateExtractedData(results);
    const parsingTime = Date.now() - startTime;
    
    console.log(`Data parsing completed in ${parsingTime}ms:`);
    console.log(`- Extracted ${consolidated.length} measurements from ${results.length} raw matches`);
    console.log(`- Pattern matches:`, debugInfo.patternsMatched);
    
    return {
      extractedData: consolidated,
      debugInfo
    };
  }

  private extractNames(line: string): Partial<ExtractedMeasurementData> | null {
    for (const namePattern of NAME_PATTERNS) {
      namePattern.lastIndex = 0; // Reset regex state
      const match = namePattern.exec(line);
      
      if (match) {
        // Validate name length
        const name1 = match[1].trim();
        const name2 = match[2].trim();
        
        if (name1.length < this.config.validation.nameMinLength || 
            name2.length < this.config.validation.nameMinLength) {
          continue;
        }

        // Handle different name formats
        if (line.includes(',')) {
          // "LastName, FirstName" format
          return {
            lastName: name1,
            firstName: name2,
            confidence: 75
          };
        } else {
          // "FirstName LastName" format
          return {
            firstName: name1,
            lastName: name2,
            confidence: 75
          };
        }
      }
    }
    return null;
  }

  private extractMeasurements(
    line: string, 
    context: Partial<ExtractedMeasurementData>
  ): ExtractedMeasurementData[] {
    const measurements: ExtractedMeasurementData[] = [];
    
    // Try each measurement pattern
    for (const [metric, config] of Object.entries(MEASUREMENT_PATTERNS)) {
      for (const pattern of config.patterns) {
        pattern.lastIndex = 0; // Reset regex state
        const match = pattern.exec(line);
        
        if (match && match[1]) {
          const value = match[1].trim();
          
          // Validate the extracted value
          if (config.validator && !config.validator(value)) {
            console.log(`Value validation failed for ${metric}: ${value}`);
            continue;
          }
          
          // Check measurement ranges
          const range = this.config.validation.measurementRanges[metric];
          if (range) {
            const numValue = parseFloat(value);
            if (numValue < range.min || numValue > range.max) {
              console.log(`Value out of range for ${metric}: ${value} (expected ${range.min}-${range.max})`);
              continue;
            }
          }
          
          measurements.push({
            ...context,
            metric,
            value,
            rawText: line,
            confidence: config.confidence
          } as ExtractedMeasurementData);
          
          console.log(`Found ${metric}: ${value} (confidence: ${config.confidence}%)`);
          break; // One row per metric per line: overlapping patterns would otherwise duplicate it (#585)
        }
      }
    }
    
    return measurements;
  }

  private extractGenericTimes(
    line: string, 
    context: Partial<ExtractedMeasurementData>
  ): ExtractedMeasurementData[] {
    const measurements: ExtractedMeasurementData[] = [];
    const lowerLine = line.toLowerCase();
    
    for (const timePattern of TIME_PATTERNS) {
      timePattern.lastIndex = 0;
      const match = timePattern.exec(line);
      
      // The patterns overlap ("4.52" matches both decimal patterns), so keep one row per value
      if (match && match[1] && !measurements.some(m => m.value === match[1])) {
        const value = match[1];
        let metric = 'UNKNOWN';
        let confidence = 40; // Lower confidence for inferred measurements
        
        // Try to infer measurement type from context.
        // Agility drills come first: their names contain digits ('5-10-5', 'T-test 10.2') that the generic
        // 40 / 10 / sprint checks below would otherwise claim. A drill is filed under the 5-0-5 only when the
        // line says 5-0-5 (a bare "agility" is any agility drill), so the meters/yards prompt never asks users
        // to confirm a label the text does not support.
        const isTTest = /\bt[\s-]?test\b/.test(lowerLine);
        const is5105 = lowerLine.includes('5105') || /\b5[\s-]10[\s-]5\b/.test(lowerLine);
        const isProAgility = /\bpro[\s-]agility\b/.test(lowerLine); // the pro agility drill is the 5-10-5
        const is505 = lowerLine.includes('505') || /\b5[\s-]0[\s-]5\b/.test(lowerLine);

        if (isTTest) {
          metric = 'T_TEST';
          confidence = 65;
        } else if (is5105 || isProAgility) {
          metric = 'AGILITY_5105';
          confidence = is5105 ? 65 : 55;
        } else if (is505) {
          metric = 'AGILITY_505_UNRESOLVED';
          confidence = 65;
        } else if (lowerLine.includes('40') || lowerLine.includes('forty')) {
          metric = 'DASH_40YD';
          confidence = 60;
        } else if ((/(?<![\d.,])10(?![.,]?\d)/.test(lowerLine) || lowerLine.includes('ten')) && /\bfly(ing)?\b/.test(lowerLine)) {
          // Only a line that says "fly" is a fly reading. A bare "10" is often a date or part of the value
          // ("10/05 2.45", "2.10"), and a guess here forces a run-in prompt (422) on the whole photo.
          metric = 'FLY10_TIME_UNRESOLVED';
          confidence = 60;
        } else if (lowerLine.includes('sprint') || lowerLine.includes('dash')) {
          metric = 'DASH_40YD';
          confidence = 50;
        }
        
        if (metric !== 'UNKNOWN') {
          // Validate against measurement ranges
          const range = this.config.validation.measurementRanges[metric];
          if (range) {
            const numValue = parseFloat(value);
            if (numValue >= range.min && numValue <= range.max) {
              measurements.push({
                ...context,
                metric,
                value,
                rawText: line,
                confidence
              } as ExtractedMeasurementData);
              
              console.log(`Inferred ${metric}: ${value} (confidence: ${confidence}%)`);
            } else {
              console.log(`Inferred value out of range for ${metric}: ${value}`);
            }
          }
        }
      }
    }
    
    return measurements;
  }

  private extractDate(line: string): string | null {
    for (const datePattern of DATE_PATTERNS) {
      datePattern.lastIndex = 0;
      const match = datePattern.exec(line);
      
      if (match) {
        return this.normalizeDate(match[0]);
      }
    }
    return null;
  }

  private extractAge(line: string): string | null {
    for (const agePattern of AGE_PATTERNS) {
      agePattern.lastIndex = 0;
      const match = agePattern.exec(line);
      
      if (match) {
        const age = parseInt(match[1]);
        if (age >= 8 && age <= 30) { // Reasonable age range for athletes
          return match[1];
        }
      }
    }
    return null;
  }

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

  private consolidateExtractedData(data: ExtractedMeasurementData[]): ExtractedMeasurementData[] {
    console.log(`Consolidating ${data.length} raw measurements...`);
    
    // Group by athlete (firstName + lastName combination)
    const grouped = new Map<string, ExtractedMeasurementData[]>();
    
    for (const item of data) {
      if (!item.firstName || !item.lastName) {
        console.log(`Skipping measurement without complete name: ${JSON.stringify(item)}`);
        continue;
      }
      
      const key = `${item.firstName.toLowerCase()}-${item.lastName.toLowerCase()}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    }

    console.log(`Found ${grouped.size} unique athletes`);

    // Consolidate data for each athlete
    const consolidated: ExtractedMeasurementData[] = [];
    
    for (const [athleteKey, measurements] of grouped) {
      console.log(`Consolidating ${measurements.length} measurements for athlete: ${athleteKey}`);
      
      // Get the most complete record for this athlete (highest confidence)
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

    console.log(`Consolidation complete: ${consolidated.length} unique measurements`);
    return consolidated;
  }
}