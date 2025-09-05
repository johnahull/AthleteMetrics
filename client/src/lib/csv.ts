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

// Email validation function
function isValidEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value.trim());
}

// Phone number validation function
function isValidPhoneNumber(value: string): boolean {
  // Remove all non-digit characters for validation
  const cleaned = value.replace(/\D/g, '');
  // Support various formats:
  // - US/Canada: 10 digits or 1 + 10 digits
  // - International: 7-15 digits, optionally starting with +
  // - Extensions are not supported in this simplified version
  return /^(\+?1?\d{10}|\+?\d{7,15})$/.test(cleaned) && cleaned.length >= 7 && cleaned.length <= 15;
}

// Smart data placement function - detects emails and phone numbers regardless of column
function smartPlaceContactData(row: any): { emails: string[], phoneNumbers: string[], warnings: string[] } {
  const emails: string[] = [];
  const phoneNumbers: string[] = [];
  const warnings: string[] = [];
  
  // Check all possible contact fields for smart detection
  const contactFields = ['emails', 'phoneNumbers', 'email', 'phone', 'contact', 'contactInfo'];
  
  contactFields.forEach(field => {
    if (row[field] && row[field].trim()) {
      const values = row[field].split(/[,;]/).map((v: string) => v.trim()).filter(Boolean);
      
      values.forEach((value: string) => {
        if (isValidEmail(value)) {
          if (!emails.includes(value)) {
            emails.push(value);
            if (field === 'phoneNumbers' || field === 'phone') {
              warnings.push(`Found email "${value}" in phone number field, moved to emails`);
            }
          }
        } else if (isValidPhoneNumber(value)) {
          if (!phoneNumbers.includes(value)) {
            phoneNumbers.push(value);
            if (field === 'emails' || field === 'email') {
              warnings.push(`Found phone number "${value}" in email field, moved to phone numbers`);
            }
          }
        } else if (value.length > 0) {
          // If it's not empty but doesn't match either format, warn about it
          warnings.push(`Unrecognized contact format: "${value}" in ${field} field`);
        }
      });
    }
  });
  
  return { emails, phoneNumbers, warnings };
}

export function validatePlayerCSV(row: any): { valid: boolean; errors: string[]; warnings?: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!row.firstName || !row.firstName.trim()) {
    errors.push('First name is required');
  }
  
  if (!row.lastName || !row.lastName.trim()) {
    errors.push('Last name is required');
  }
  
  // Validate birth date format - now required
  if (!row.birthDate || !row.birthDate.trim()) {
    errors.push('Birth date is required');
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(row.birthDate)) {
      errors.push('Birth date must be in YYYY-MM-DD format');
    } else {
      // Validate date is not in the future
      const birthDate = new Date(row.birthDate);
      if (birthDate > new Date()) {
        errors.push('Birth date cannot be in the future');
      }
    }
  }
  
  // Birth year is now optional but validate if provided
  if (row.birthYear && row.birthYear.trim()) {
    if (isNaN(parseInt(row.birthYear))) {
      errors.push('Birth year must be a valid number');
    } else {
      const year = parseInt(row.birthYear);
      if (year < 1990 || year > 2020) {
        errors.push('Birth year must be between 1990 and 2020');
      }
    }
  }
  
  // Smart contact data validation and placement
  const contactData = smartPlaceContactData(row);
  warnings.push(...contactData.warnings);
  
  // Update row data with properly placed contact information
  row.emails = contactData.emails.join(',');
  row.phoneNumbers = contactData.phoneNumbers.join(',');
  
  // Validate final email formats
  if (contactData.emails.length > 0) {
    const invalidEmails = contactData.emails.filter((email: string) => !isValidEmail(email));
    if (invalidEmails.length > 0) {
      errors.push(`Invalid email format: ${invalidEmails.join(', ')}`);
    }
  }
  
  // Validate final phone number formats
  if (contactData.phoneNumbers.length > 0) {
    const invalidPhones = contactData.phoneNumbers.filter((phone: string) => !isValidPhoneNumber(phone));
    if (invalidPhones.length > 0) {
      errors.push(`Invalid phone number format: ${invalidPhones.join(', ')}`);
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
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// Export the validation functions for use elsewhere
export { isValidEmail, isValidPhoneNumber, smartPlaceContactData };

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
