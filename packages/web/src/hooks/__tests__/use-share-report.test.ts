import { describe, it, expect } from 'vitest';
import { getShareErrorMessage } from '../use-share-report';

describe('getShareErrorMessage', () => {
  it('extracts the message from an apiRequest error with a JSON body', () => {
    const err = new Error('403: {"code":"UNDER_13_SHARE_BLOCKED","message":"Send the PDF to their parent."}');
    expect(getShareErrorMessage(err, 'fallback')).toBe('Send the PDF to their parent.');
  });

  it('falls back to the raw message when the body is not JSON', () => {
    expect(getShareErrorMessage(new Error('500: boom'), 'fallback')).toBe('500: boom');
  });

  it('uses the fallback when there is no message', () => {
    expect(getShareErrorMessage(new Error(''), 'fallback')).toBe('fallback');
  });
});
