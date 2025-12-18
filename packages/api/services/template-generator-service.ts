/**
 * Template Generator Service
 * Generates CSV import templates with realistic example data
 */

export interface MetricInfo {
  code: string;
  unit: string | null;
}

export class TemplateGeneratorService {
  // Sample values for realistic example data
  private sampleValues: Record<string, string> = {
    FLY10_TIME: '1.28',
    VERTICAL_JUMP: '22.5',
    DASH_40YD: '5.1',
    AGILITY_505: '2.45',
    AGILITY_5105: '4.8',
    T_TEST: '9.8',
    TOP_SPEED: '18.5',
    RSI: '2.1',
    HEIGHT: '68',
    WEIGHT: '155',
    BROAD_JUMP: '95',
  };

  private sampleNames = {
    firstNames: ['Mia', 'Jordan', 'Alex', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Avery'],
    lastNames: ['Chen', 'Williams', 'Rodriguez', 'Anderson', 'Thompson', 'Martinez', 'Lee', 'Davis'],
  };

  private sampleSports = ['Football', 'Basketball', 'Soccer', 'Track', 'Baseball', 'Volleyball'];
  private samplePositions = ['Forward', 'Guard', 'Midfielder', 'Striker', 'Quarterback', 'Running Back'];

  /**
   * Get sample value for a metric
   */
  getSampleValue(metricCode: string): string {
    return this.sampleValues[metricCode] || '';
  }

  /**
   * Generate a single athlete example row
   */
  generateAthleteExample(firstName: string, lastName: string, teamName: string): Record<string, string> {
    const currentYear = new Date().getFullYear();
    const birthYear = currentYear - 16 - Math.floor(Math.random() * 3); // 16-18 years old
    const graduationYear = currentYear + Math.floor(Math.random() * 4); // 0-3 years from now

    const birthMonth = Math.floor(Math.random() * 12) + 1;
    const birthDay = Math.floor(Math.random() * 28) + 1;
    const birthDate = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;

    const genders = ['Male', 'Female'];
    const gender = genders[Math.floor(Math.random() * genders.length)];

    const sport = this.sampleSports[Math.floor(Math.random() * this.sampleSports.length)];
    const position = this.samplePositions[Math.floor(Math.random() * this.samplePositions.length)];

    const height = 60 + Math.floor(Math.random() * 20); // 60-80 inches
    const weight = 120 + Math.floor(Math.random() * 100); // 120-220 lbs

    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
    const phone = `555-${String(Math.floor(Math.random() * 900) + 100)}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    return {
      firstName,
      lastName,
      birthDate,
      birthYear: String(birthYear),
      graduationYear: String(graduationYear),
      gender,
      emails: email,
      phoneNumbers: phone,
      sports: sport,
      position,
      height: String(height),
      weight: String(weight),
      school: 'Example High School',
      teamName,
    };
  }

  /**
   * Generate a single measurement example row
   */
  generateMeasurementExample(
    firstName: string,
    lastName: string,
    teamName: string,
    metric: MetricInfo
  ): Record<string, string> {
    const now = new Date();
    const daysAgo = Math.floor(Math.random() * 60); // Random date within last 60 days
    const measurementDate = new Date(now);
    measurementDate.setDate(measurementDate.getDate() - daysAgo);

    const date = measurementDate.toISOString().split('T')[0];
    const age = 16 + Math.floor(Math.random() * 3); // 16-18 years old

    const genders = ['Male', 'Female'];
    const gender = genders[Math.floor(Math.random() * genders.length)];

    const value = this.getSampleValue(metric.code);
    const units = metric.unit || '';

    // flyInDistance is typically 10 or 20 yards for fly times
    const flyInDistance = metric.code.includes('FLY') ? '10' : '';

    return {
      firstName,
      lastName,
      teamName,
      date,
      age: String(age),
      metric: metric.code,
      value,
      units,
      flyInDistance,
      notes: '',
      gender,
    };
  }

  /**
   * Generate example rows for CSV template
   */
  generateExampleRows(
    type: 'athletes' | 'measurements',
    teams: { name: string }[],
    metrics: MetricInfo[],
    count: number = 3
  ): Record<string, string>[] {
    const rows: Record<string, string>[] = [];

    if (type === 'athletes') {
      // Generate athlete examples distributed across teams
      for (let i = 0; i < count; i++) {
        const firstName = this.sampleNames.firstNames[i % this.sampleNames.firstNames.length];
        const lastName = this.sampleNames.lastNames[i % this.sampleNames.lastNames.length];
        const team = teams[i % teams.length];

        rows.push(this.generateAthleteExample(firstName, lastName, team.name));
      }
    } else if (type === 'measurements') {
      // Generate measurement examples with variety of metrics
      for (let i = 0; i < count; i++) {
        const firstName = this.sampleNames.firstNames[i % this.sampleNames.firstNames.length];
        const lastName = this.sampleNames.lastNames[i % this.sampleNames.lastNames.length];
        const team = teams[i % teams.length];
        const metric = metrics[i % metrics.length];

        rows.push(this.generateMeasurementExample(firstName, lastName, team.name, metric));
      }
    }

    return rows;
  }

  /**
   * Build CSV content from headers and rows
   */
  buildCsvContent(headers: string[], rows: Record<string, string>[], comment?: string): string {
    const lines: string[] = [];

    // Add comment line if provided
    if (comment) {
      lines.push(`# ${comment}`);
    }

    // Add header line
    lines.push(headers.join(','));

    // Add data rows
    for (const row of rows) {
      const values = headers.map(header => {
        const value = row[header] || '';

        // Escape values with commas, quotes, or newlines
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }

        return value;
      });

      lines.push(values.join(','));
    }

    return lines.join('\n');
  }
}

export const templateGeneratorService = new TemplateGeneratorService();
