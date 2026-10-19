import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('boom');
  return <p>fine</p>;
}

describe('ErrorBoundary resetKey', () => {
  it('shows the fallback after a render error and clears it when resetKey changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    const fallback = <p>broken page</p>;
    const { rerender } = render(
      <ErrorBoundary fallback={fallback} resetKey="/a"><Boom explode /></ErrorBoundary>,
    );
    expect(screen.getByText('broken page')).toBeInTheDocument();

    // same key: still showing the fallback
    rerender(<ErrorBoundary fallback={fallback} resetKey="/a"><Boom explode={false} /></ErrorBoundary>);
    expect(screen.getByText('broken page')).toBeInTheDocument();

    // navigation: new key clears the error
    rerender(<ErrorBoundary fallback={fallback} resetKey="/b"><Boom explode={false} /></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('keeps the fallback when the new route itself crashes, without rendering children twice', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    const onError = vi.fn();
    const fallback = <p>broken page</p>;
    const { rerender } = render(
      <ErrorBoundary fallback={fallback} resetKey="/a" onError={onError}><Boom explode={false} /></ErrorBoundary>,
    );
    rerender(<ErrorBoundary fallback={fallback} resetKey="/b" onError={onError}><Boom explode /></ErrorBoundary>);
    expect(screen.getByText('broken page')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
