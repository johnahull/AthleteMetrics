export interface PatternConfig {
  patterns: RegExp[];
  confidence: number;
  validator?: (value: string) => boolean;
}

export const MEASUREMENT_PATTERNS: Record<string, PatternConfig> = {
  VERTICAL_JUMP: {
    patterns: [
      /(?:vert|jump|vertical).*?(\d{1,2}(?:\.\d)?)\s*(?:in|inch|")/gi,
      /(\d{1,2}(?:\.\d)?)\s*(?:in|inch|")\s*(?:vert|jump|vertical)/gi,
      /vertical.*?(\d{1,2}(?:\.\d)?)/gi,
    ],
    confidence: 80,
    validator: (value: string) => {
      const num = parseFloat(value);
      return num >= 10 && num <= 50; // Reasonable vertical jump range in inches
    }
  },
  
  DASH_40YD: {
    patterns: [
      /(?:40|forty).*?(?:yard|yd).*?(?<!\d|\d\.)(\d\.\d{2})(?!\d)/gi,
      /(?<!\d|\d\.)(\d\.\d{2})(?!\d)\s*(?:sec|s)?\s*(?:40|forty)/gi,
      /40.*?(?<!\d|\d\.)(\d\.\d{2})(?!\d)/gi,
      /forty.*?(?<!\d|\d\.)(\d\.\d{2})(?!\d)/gi,
    ],
    confidence: 80,
    validator: (value: string) => {
      const num = parseFloat(value);
      return num >= 3.0 && num <= 8.0; // Reasonable 40-yard dash range in seconds
    }
  },
  
  // Run-in-neutral: the photo route resolves this to one of the five FLY10 codes from the user's choice.
  FLY10_TIME_UNRESOLVED: {
    patterns: [
      // The value may not be cut out of a bigger number ("11.05", "1.055"), and the 10 must be a standalone
      // distance, not part of another number ("10.5", "1,10"). See #585.
      /(?:(?<![\d.,])10(?![.,]?\d)|ten).*?(?:yard|yd).*?(?:fly|time).*?(?<!\d|\d\.)(\d\.\d{2})(?!\d)/gi,
      /(?:fly|time).*?(?:(?<![\d.,])10(?![.,]?\d)|ten).*?(?<!\d|\d\.)(\d\.\d{2})(?!\d)/gi,
      /(?<![\d.,])10(?![.,]?\d).*?fly.*?(?<!\d|\d\.)(\d\.\d{2})(?!\d)/gi,
      /fly.*?(?<![\d.,])10(?![.,]?\d).*?(?<!\d|\d\.)(\d\.\d{2})(?!\d)/gi,
    ],
    confidence: 80,
    validator: (value: string) => {
      const num = parseFloat(value);
      return num >= 0.8 && num <= 3.0; // Reasonable 10-yard fly range in seconds
    }
  },
  
  // Protocol-neutral: the photo route resolves this to AGILITY_505_M or _YD from the user's choice.
  AGILITY_505_UNRESOLVED: {
    patterns: [
      /(?:5-0-5|505).*?(?<!\d|\d\.)(\d\.\d{2})(?!\d)/gi,
      /agility.*?505.*?(?<!\d|\d\.)(\d\.\d{2})(?!\d)/gi,
      /(?<!\d|\d\.)(\d\.\d{2})(?!\d)\s*(?:sec|s)?\s*505/gi,
    ],
    confidence: 75,
    validator: (value: string) => {
      const num = parseFloat(value);
      return num >= 1.3 && num <= 4.0;
    }
  },
  
  AGILITY_5105: {
    patterns: [
      /(?:5-10-5|5105).*?(?<!\d|\d\.)(\d\.\d{2})(?!\d)/gi,
      /agility.*?5105.*?(?<!\d|\d\.)(\d\.\d{2})(?!\d)/gi,
      /(?<!\d|\d\.)(\d\.\d{2})(?!\d)\s*(?:sec|s)?\s*5105/gi,
    ],
    confidence: 75,
    validator: (value: string) => {
      const num = parseFloat(value);
      return num >= 2.0 && num <= 6.0;
    }
  },
  
  T_TEST: {
    patterns: [
      /t[_-]?test.*?(?<!\d|\d\.)(\d{1,2}\.\d{2})(?!\d)/gi,
      /(?<!\d|\d\.)(\d{1,2}\.\d{2})(?!\d)\s*(?:sec|s)?\s*t[_-]?test/gi,
      /agility.*?t.*?(?<!\d|\d\.)(\d{1,2}\.\d{2})(?!\d)/gi,
    ],
    confidence: 75,
    validator: (value: string) => {
      const num = parseFloat(value);
      return num >= 7.0 && num <= 15.0;
    }
  },
  
  RSI: {
    patterns: [
      /(?:rsi|reactive.*?strength).*?(?<!\d|\d\.)(\d\.\d{1,3})(?!\d)/gi,
      /(?<!\d|\d\.)(\d\.\d{1,3})(?!\d)\s*rsi/gi,
      /strength.*?index.*?(?<!\d|\d\.)(\d\.\d{1,3})(?!\d)/gi,
    ],
    confidence: 70,
    validator: (value: string) => {
      const num = parseFloat(value);
      return num >= 0.5 && num <= 5.0;
    }
  },

  TOP_SPEED: {
    patterns: [
      /(?:top|max|maximum).*?speed.*?(\d{1,2}(?:\.\d{1,2})?)\s*(?:mph|miles)/gi,
      /(\d{1,2}(?:\.\d{1,2})?)\s*mph.*?(?:top|max|speed)/gi,
      /speed.*?(\d{1,2}(?:\.\d{1,2})?)\s*mph/gi,
    ],
    confidence: 75,
    validator: (value: string) => {
      const num = parseFloat(value);
      return num >= 10 && num <= 25;
    }
  }
};

export const NAME_PATTERNS = [
  // "FirstName LastName" format
  /([A-Z][a-z]{1,})\s+([A-Z][a-z]{1,})/g,
  // "LastName, FirstName" format
  /([A-Z][a-z]{1,}),\s*([A-Z][a-z]{1,})/g,
  // More flexible patterns
  /([A-Z][a-zA-Z']{1,})\s+([A-Z][a-zA-Z']{1,})/g,
];

export const DATE_PATTERNS = [
  // MM/DD/YYYY or MM-DD-YYYY
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g,
  // YYYY-MM-DD
  /(\d{4}-\d{2}-\d{2})/g,
  // DD/MM/YYYY
  /(\d{1,2}\/\d{1,2}\/\d{4})/g,
  // Month DD, YYYY
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/gi,
];

export const AGE_PATTERNS = [
  /(?:age|yrs?|years?).*?(\d{1,2})/gi,
  /(\d{1,2})\s*(?:yrs?|years?)\s*old/gi,
  /(\d{1,2})\s*(?:year|yr)\s*old/gi,
];

export const TIME_PATTERNS = [
  // Seconds with decimal (e.g., 4.35, 12.45)
  /(?<!\d|\d\.)(\d{1,2}\.\d{2,3})(?!\d)\s*s?e?c?/gi,
  // Minutes:seconds format (e.g., 1:23.45)
  /(\d{1,2}:\d{2}\.\d{2})/g,
  // Just decimal numbers that could be times
  /(?<!\d|\d\.)(\d\.\d{2,3})(?!\d)/g,
];

// Helper function to get all patterns for a measurement type
export function getPatternConfig(metric: string): PatternConfig | null {
  return MEASUREMENT_PATTERNS[metric] || null;
}

// Helper function to test if a value matches any pattern for a metric
export function testMetricPatterns(metric: string, text: string): boolean {
  const config = getPatternConfig(metric);
  if (!config) return false;
  
  return config.patterns.some(pattern => {
    pattern.lastIndex = 0; // Reset regex state
    return pattern.test(text);
  });
}