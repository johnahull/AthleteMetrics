import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FlyRunInPicker } from '../fly-run-in-picker';

afterEach(cleanup);

describe('FlyRunInPicker', () => {
  it('offers the five run-in distances with no default selected', () => {
    const { container } = render(<FlyRunInPicker value={undefined} onChange={() => {}} />);
    const radios = Array.from(container.querySelectorAll('[role="radio"]'));
    expect(radios).toHaveLength(5);
    expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    const labels = radios.map((r) => container.querySelector(`label[for="${r.id}"]`)?.textContent);
    expect(labels).toEqual(['5 yd', '10 yd', '15 yd', '20 yd', '30 yd']);
  });

  it('reports the chosen distance as a number', () => {
    const onChange = vi.fn();
    const { container } = render(<FlyRunInPicker value={undefined} onChange={onChange} />);
    fireEvent.click(container.querySelectorAll('[role="radio"]')[2]);
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('shows the current choice', () => {
    const { container } = render(<FlyRunInPicker value={30} onChange={() => {}} />);
    const checked = container.querySelector('[role="radio"][aria-checked="true"]')!;
    expect(container.querySelector(`label[for="${checked.id}"]`)).toHaveTextContent('30 yd');
  });

  it('announces the server error and ties it to the group', () => {
    const { container } = render(<FlyRunInPicker value={undefined} onChange={() => {}} error="Choose the run-in distance" />);
    const group = container.querySelector('[role="radiogroup"]')!;
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert).toHaveTextContent('Choose the run-in distance');
    expect(group.getAttribute('aria-describedby')!.split(' ')).toContain(alert.id);
    expect(group.getAttribute('aria-labelledby')).toBe(container.querySelector('legend')!.id);
  });

  it('uses unique ids across two instances', () => {
    const { container } = render(
      <>
        <FlyRunInPicker value={undefined} onChange={() => {}} error="e" />
        <FlyRunInPicker value={10} onChange={() => {}} error="e" />
      </>
    );
    const ids = Array.from(container.querySelectorAll('[id]')).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ties the help text to the group so assistive tech announces it, with or without an error', () => {
    const { container, rerender } = render(<FlyRunInPicker value={undefined} onChange={() => {}} />);
    const group = container.querySelector('[role="radiogroup"]')!;
    const hint = container.querySelector('p')!;
    expect(hint).toHaveTextContent(/needed only if the photo has 10-yard fly readings/i);
    expect(group.getAttribute('aria-describedby')).toBe(hint.id);
    rerender(<FlyRunInPicker value={undefined} onChange={() => {}} error="e" />);
    const alert = container.querySelector('[role="alert"]')!;
    expect(group.getAttribute('aria-describedby')!.split(' ').sort()).toEqual([hint.id, alert.id].sort());
    // role="alert" already announces assertively
    expect(alert.hasAttribute('aria-live')).toBe(false);
  });
});
