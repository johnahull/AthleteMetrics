import { describe, it, expect } from 'vitest';
import { mergePromptOverrides } from '../ai-prompt-overrides-service';

describe('mergePromptOverrides', () => {
  it('has no org layer and no hash with nothing stored', () => {
    expect(mergePromptOverrides(undefined, null)).toEqual({ site: undefined, org: undefined, hash: null, siteInvalid: false, orgInvalid: false });
  });

  it('site-only keeps the site hash', () => {
    const r = mergePromptOverrides({ toneParent: 'Warm.' }, undefined);
    expect(r.site).toEqual({ toneParent: 'Warm.' });
    expect(r.org).toBeUndefined();
    expect(r.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('parses the org layer; the hash covers both layers', () => {
    const siteOnly = mergePromptOverrides({ toneParent: 'Warm.' }, undefined).hash;
    const r = mergePromptOverrides({ toneParent: 'Warm.' }, { toneParent: 'Bold.' });
    expect(r.org).toEqual({ toneParent: 'Bold.' });
    expect(r.hash).not.toBe(siteOnly);
    expect(mergePromptOverrides({ toneParent: 'Warm.' }, { toneParent: 'Other.' }).hash).not.toBe(r.hash);
  });

  it('ignores an invalid org row (role is site-only) and flags it; site still applies', () => {
    const r = mergePromptOverrides({ toneParent: 'Warm.' }, { role: 'x' });
    expect(r.org).toBeUndefined();
    expect(r.orgInvalid).toBe(true);
    expect(r.site).toEqual({ toneParent: 'Warm.' });
  });

  it('flags an invalid site row', () => {
    expect(mergePromptOverrides({ nope: 'x' }, undefined).siteInvalid).toBe(true);
  });

  it('an empty org object is inherit', () => {
    expect(mergePromptOverrides(undefined, {}).org).toBeUndefined();
  });
});
