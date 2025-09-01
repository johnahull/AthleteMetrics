export function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function parseCSV(csvText: string): any[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(header => header.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(value => value.trim());
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    data.push(row);
  }
  
  return data;
}

export function arrayToCSV(data: any[], headers?: string[]): string {
  if (data.length === 0) return '';
  
  const csvHeaders = headers || Object.keys(data[0]);
  const headerRow = csvHeaders.join(',');
  
  const rows = data.map(row => 
    csvHeaders.map(header => {
      const value = row[header] || '';
      // Escape commas and quotes
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );
  
  return [headerRow, ...rows].join('\n');
}

export function validatePlayerCSV(row: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!row.firstName || !row.firstName.trim()) {
    errors.push('First name is required');
  }
  
  if (!row.lastName || !row.lastName.trim()) {
    errors.push('Last name is required');
  }
  
  if (!row.birthYear || isNaN(parseInt(row.birthYear))) {
    errors.push('Valid birth year is required');
  } else {
    const year = parseInt(row.birthYear);
    if (year < 1990 || year > 2020) {
      errors.push('Birth year must be between 1990 and 2020');
    }
  }
  
  // Team name is now optional since athletes can be independent
  
  // Validate emails format if provided
  if (row.emails && row.emails.trim()) {
    const emails = row.emails.split(',').map((e: string) => e.trim());
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter((email: string) => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      errors.push(`Invalid email format: ${invalidEmails.join(', ')}`);
    }
  }
  
  // Validate birth date format if provided
  if (row.birthDate && row.birthDate.trim()) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(row.birthDate)) {
      errors.push('Birth date must be in YYYY-MM-DD format');
    }
  }
  
  // Validate height and weight if provided
  if (row.height && (isNaN(parseInt(row.height)) || parseInt(row.height) < 36 || parseInt(row.height) > 84)) {
    errors.push('Height must be between 36-84 inches');
  }
  
  if (row.weight && (isNaN(parseInt(row.weight)) || parseInt(row.weight) < 50 || parseInt(row.weight) > 400)) {
    errors.push('Weight must be between 50-400 pounds');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateMeasurementCSV(row: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate athlete identification
  if (!row.firstName || !row.firstName.trim()) {
    errors.push('First name is required');
  }
  
  if (!row.lastName || !row.lastName.trim()) {
    errors.push('Last name is required');
  }
  
  if (!row.birthYear || isNaN(parseInt(row.birthYear))) {
    errors.push('Valid birth year is required');
  } else {
    const year = parseInt(row.birthYear);
    if (year < 1990 || year > 2020) {
      errors.push('Birth year must be between 1990 and 2020');
    }
  }
  
  // Validate measurement date
  if (!row.date || !row.date.trim()) {
    errors.push('Date is required');
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(row.date)) {
      errors.push('Date must be in YYYY-MM-DD format');
    }
  }
  
  // Validate age
  if (!row.age || isNaN(parseInt(row.age))) {
    errors.push('Valid age is required');
  } else {
    const age = parseInt(row.age);
    if (age < 10 || age > 25) {
      errors.push('Age must be between 10 and 25');
    }
  }
  
  // Validate metric type
  const validMetrics = ['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'RSI'];
  if (!row.metric || !validMetrics.includes(row.metric)) {
    errors.push(`Metric must be one of: ${validMetrics.join(', ')}`);
  }
  
  // Validate value
  if (!row.value || isNaN(parseFloat(row.value))) {
    errors.push('Valid numeric value is required');
  } else {
    const value = parseFloat(row.value);
    if (value <= 0) {
      errors.push('Value must be positive');
    }
  }
  
  // Validate units
  const validUnits = ['s', 'in', ''];
  if (row.units && !validUnits.includes(row.units)) {
    errors.push('Units must be "s" for time, "in" for distance, or empty for dimensionless');
  }
  
  // Validate flyInDistance if provided
  if (row.flyInDistance && row.flyInDistance.trim() && isNaN(parseFloat(row.flyInDistance))) {
    errors.push('Fly-in distance must be a valid number');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
