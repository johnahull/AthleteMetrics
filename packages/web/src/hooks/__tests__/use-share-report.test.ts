import { describe, it, expect } from 'vitest';
import { getShareErrorMessage, buildBulkDistributeDescription } from '../use-share-report';

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

describe('buildBulkDistributeDescription', () => {
  it('says nothing was sent when every counter is zero', () => {
    expect(buildBulkDistributeDescription({ sent: 0, alreadySent: 0, skipped: 0, blockedUnder13: 0 })).toBe(
      'No reports were sent.',
    );
  });

  it('reports only the sent count', () => {
    expect(buildBulkDistributeDescription({ sent: 1, alreadySent: 0, skipped: 0 })).toBe('Sent 1 report.');
    expect(buildBulkDistributeDescription({ sent: 2, alreadySent: 0, skipped: 0 })).toBe('Sent 2 reports.');
  });

  it('reports only the under-13 block when nothing else happened', () => {
    expect(buildBulkDistributeDescription({ sent: 0, alreadySent: 0, skipped: 0, blockedUnder13: 3 })).toBe(
      '3 athletes under 13 or without a date of birth were skipped; send their PDF to a parent.',
    );
  });

  it('joins the non-zero parts cleanly', () => {
    expect(buildBulkDistributeDescription({ sent: 2, alreadySent: 1, skipped: 2, blockedUnder13: 3 })).toBe(
      'Sent 2 reports. 1 already sent. 3 athletes under 13 or without a date of birth were skipped; send their PDF to a parent. 2 skipped.',
    );
  });
});
