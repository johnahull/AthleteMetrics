import { describe, it, expect } from 'vitest';
import { AI_MODELS as SERVICE_MODELS } from '../ai-insights-service';
import { AI_MODELS as VALIDATION_MODELS, siteSettings } from '@shared/schema-original';
import { siteSettings as modularSiteSettings } from '@shared/schema/tables/settings';
import { AI_MODELS as CONSTANT_MODELS } from '@shared/schema/constants';

/**
 * The AI model keys are listed in several places. They must stay identical, otherwise
 * a model can be selectable but rejected (or typed as invalid) somewhere else.
 * The Postgres CHECK constraints (migrations/0142) and the admin dropdown
 * (packages/web/src/pages/admin.tsx) also have to be updated when this list changes.
 */
describe('AI model keys', () => {
  const serviceKeys = Object.keys(SERVICE_MODELS).sort();

  it('settings validation enum matches the service config', () => {
    expect([...VALIDATION_MODELS].sort()).toEqual(serviceKeys);
  });

  it('shared AIModel constant matches the service config', () => {
    expect([...CONSTANT_MODELS].sort()).toEqual(serviceKeys);
  });

  it.each([
    ['schema-original', siteSettings],
    ['schema/tables/settings', modularSiteSettings],
  ])('site_settings.ai_model defaults to gpt-6-luna (%s)', (_name, table) => {
    expect(table.aiModel.default).toBe('gpt-6-luna');
    expect(serviceKeys).toContain('gpt-6-luna');
  });
});
