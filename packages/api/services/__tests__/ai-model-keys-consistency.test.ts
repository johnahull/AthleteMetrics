import { describe, it, expect } from 'vitest';
import { AI_MODELS as SERVICE_MODELS } from '../ai-insights-service';
import { AI_MODELS as VALIDATION_MODELS, siteSettings, updateSiteSettingsSchema } from '@shared/schema-original';
import { siteSettings as modularSiteSettings } from '@shared/schema/tables/settings';
import { AI_MODELS as CONSTANT_MODELS } from '@shared/schema/constants';
import { DEFAULT_AI_MODEL_KEY, SELECTABLE_AI_MODEL_KEYS } from '@shared/ai-models';

/**
 * The AI model keys must be identical everywhere they are used, otherwise a model can be
 * selectable but rejected (or typed as invalid) somewhere else. All lists derive from
 * packages/shared/ai-models.ts; this guards against someone reintroducing a hand-written copy.
 */
describe('AI model keys', () => {
  const serviceKeys = Object.keys(SERVICE_MODELS).sort();

  it('settings validation enum matches the service config', () => {
    expect([...VALIDATION_MODELS].sort()).toEqual(serviceKeys);
  });

  it('shared AIModel constant matches the service config', () => {
    expect([...CONSTANT_MODELS].sort()).toEqual(serviceKeys);
  });

  it("all key lists equal the registry's selectable keys", () => {
    expect(serviceKeys).toEqual([...SELECTABLE_AI_MODEL_KEYS].sort());
  });

  it.each(['claude-haiku-3', 'gemini-2.0-flash-lite', 'claude-sonnet-4.5'])(
    'settings schema rejects retired model %s',
    (aiModel) => {
      expect(updateSiteSettingsSchema.safeParse({ aiModel }).success).toBe(false);
    },
  );

  it.each(['claude-sonnet-5.5', 'gpt-6-luna', 'claude-haiku-4.5'])('settings schema accepts %s', (aiModel) => {
    expect(updateSiteSettingsSchema.safeParse({ aiModel }).success).toBe(true);
  });

  it.each([
    ['schema-original', siteSettings],
    ['schema/tables/settings', modularSiteSettings],
  ])('site_settings.ai_model defaults to the registry default (%s)', (_name, table) => {
    expect(table.aiModel.default).toBe(DEFAULT_AI_MODEL_KEY);
    expect(serviceKeys).toContain(DEFAULT_AI_MODEL_KEY);
  });
});
