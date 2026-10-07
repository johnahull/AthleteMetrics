/**
 * sendEventMeasurementError maps service errors to HTTP statuses. The event routes
 * admit only event managers, so the MQ / clip permission errors should not reach
 * it today; if they ever do they must be a 403, not a 500 (AM-FEAT-015 R1/R2).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../storage', () => ({ storage: {} }));

import { sendEventMeasurementError } from '../event-measurements-routes';
import { MediaUrlPermissionError, MovementQualityPermissionError } from '../../services/measurement-service';

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

describe('sendEventMeasurementError', () => {
  it('maps a MovementQualityPermissionError to 403 with its message', () => {
    const res = mockRes();
    const error = new MovementQualityPermissionError('MQ_JUMP');
    sendEventMeasurementError(res, error);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: error.message });
  });

  it('maps a MediaUrlPermissionError to 403 with its message', () => {
    const res = mockRes();
    const error = new MediaUrlPermissionError();
    sendEventMeasurementError(res, error);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: error.message });
  });

  it('still hides unexpected errors behind a 500', () => {
    const res = mockRes();
    sendEventMeasurementError(res, new Error('boom'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to save event measurement' });
  });
});
