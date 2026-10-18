import { describe, it, expect } from 'vitest';
import { createReportTemplateSchema, updateReportTemplateSchema } from '../report-template-schemas';

describe('report template description', () => {
  it('update accepts null (clears the description) and a string', () => {
    expect(updateReportTemplateSchema.parse({ description: null }).description).toBeNull();
    expect(updateReportTemplateSchema.parse({ description: ' hi ' }).description).toBe('hi');
    expect('description' in updateReportTemplateSchema.parse({})).toBe(false);
  });

  it('create still rejects null', () => {
    expect(createReportTemplateSchema.safeParse({ name: 'n', metrics: ['A'], description: null }).success).toBe(false);
  });
});
