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
  
  if (!row.teamName || !row.teamName.trim()) {
    errors.push('Team name is required');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateMeasurementCSV(row: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!row.fullName || !row.fullName.trim()) {
    errors.push('Full name is required');
  }
  
  if (!row.birthYear || isNaN(parseInt(row.birthYear))) {
    errors.push('Valid birth year is required');
  }
  
  if (!row.date || !row.date.trim()) {
    errors.push('Date is required');
  } else {
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(row.date)) {
      errors.push('Date must be in YYYY-MM-DD format');
    }
  }
  
  if (!row.metric || !['FLY10_TIME', 'VERTICAL_JUMP'].includes(row.metric)) {
    errors.push('Metric must be FLY10_TIME or VERTICAL_JUMP');
  }
  
  if (!row.value || isNaN(parseFloat(row.value))) {
    errors.push('Valid numeric value is required');
  } else {
    const value = parseFloat(row.value);
    if (value <= 0) {
      errors.push('Value must be positive');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
