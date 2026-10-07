import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Protocol505Picker } from '../protocol-505-picker';

afterEach(cleanup);

describe('Protocol505Picker ids', () => {
  it('uses unique, correctly wired ids across two instances', () => {
    const { container } = render(
      <>
        <Protocol505Picker value={undefined} onChange={() => {}} error="pick one" />
        <Protocol505Picker value="M" onChange={() => {}} error="pick one" />
      </>
    );
    const ids = Array.from(container.querySelectorAll('[id]')).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);

    const fieldsets = container.querySelectorAll('fieldset');
    expect(fieldsets).toHaveLength(2);
    fieldsets.forEach((fs) => {
      const legend = fs.querySelector('legend')!;
      const group = fs.querySelector('[role="radiogroup"]')!;
      expect(group.getAttribute('aria-labelledby')).toBe(legend.id);
      const err = fs.querySelector('[role="alert"]')!;
      expect(group.getAttribute('aria-describedby')).toBe(err.id);
      const radios = fs.querySelectorAll('[role="radio"]');
      expect(radios).toHaveLength(2);
      radios.forEach((r) => {
        const label = fs.querySelector(`label[for="${r.id}"]`);
        expect(label).not.toBeNull();
      });
      expect(fs.querySelector(`label[for="${radios[0].id}"]`)).toHaveTextContent('Meters');
      expect(fs.querySelector(`label[for="${radios[1].id}"]`)).toHaveTextContent('Yards');
    });
  });
});
