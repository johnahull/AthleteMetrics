import { describe, it, expect, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requestCacheMiddleware } from '../request-cache';

describe('requestCacheMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {};
    mockNext = () => {};
  });

  it('should attach an empty Map to req.cache', () => {
    requestCacheMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.cache).toBeInstanceOf(Map);
    expect(mockReq.cache?.size).toBe(0);
  });

  it('should call next() to continue middleware chain', () => {
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    requestCacheMiddleware(mockReq as Request, mockRes as Response, next);

    expect(nextCalled).toBe(true);
  });

  it('should create a new cache for each request (request-scoped)', () => {
    const req1 = {} as Request;
    const req2 = {} as Request;

    requestCacheMiddleware(req1, mockRes as Response, mockNext);
    requestCacheMiddleware(req2, mockRes as Response, mockNext);

    // Set value in first request's cache
    req1.cache?.set('key', 'value1');

    // Second request should have empty cache (not shared)
    expect(req2.cache?.has('key')).toBe(false);
    expect(req1.cache?.get('key')).toBe('value1');
  });

  it('should support storing any value type in cache', () => {
    requestCacheMiddleware(mockReq as Request, mockRes as Response, mockNext);

    const testObject = { id: '123', name: 'test' };
    const testArray = [1, 2, 3];

    mockReq.cache?.set('object', testObject);
    mockReq.cache?.set('array', testArray);
    mockReq.cache?.set('string', 'value');
    mockReq.cache?.set('number', 42);

    expect(mockReq.cache?.get('object')).toEqual(testObject);
    expect(mockReq.cache?.get('array')).toEqual(testArray);
    expect(mockReq.cache?.get('string')).toBe('value');
    expect(mockReq.cache?.get('number')).toBe(42);
  });
});
