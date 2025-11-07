import { describe, it, expect, beforeEach } from 'vitest';
import { getBaseUrl, generateInvitationLink } from '../../packages/api/utils/url-utils';
import type { Request } from 'express';

describe('url-utils', () => {
  describe('getBaseUrl', () => {
    let mockReq: Partial<Request>;

    beforeEach(() => {
      mockReq = {
        protocol: 'https',
        get: (header: string) => {
          if (header === 'host') return 'example.com';
          return undefined;
        },
      };
      delete process.env.APP_URL;
    });

    it('should use APP_URL when set', () => {
      process.env.APP_URL = 'https://custom-domain.com';
      const result = getBaseUrl(mockReq as Request);
      expect(result).toBe('https://custom-domain.com');
    });

    it('should remove trailing slash from APP_URL', () => {
      process.env.APP_URL = 'https://custom-domain.com/';
      const result = getBaseUrl(mockReq as Request);
      expect(result).toBe('https://custom-domain.com');
    });

    it('should construct URL from request when APP_URL not set', () => {
      const result = getBaseUrl(mockReq as Request);
      expect(result).toBe('https://example.com');
    });

    it('should remove trailing slash from constructed URL', () => {
      mockReq.get = (header: string) => {
        if (header === 'host') return 'example.com/';
        return undefined;
      };
      const result = getBaseUrl(mockReq as Request);
      expect(result).toBe('https://example.com');
    });

    it('should handle http protocol', () => {
      mockReq.protocol = 'http';
      const result = getBaseUrl(mockReq as Request);
      expect(result).toBe('http://example.com');
    });
  });

  describe('generateInvitationLink', () => {
    let mockReq: Partial<Request>;
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';

    beforeEach(() => {
      mockReq = {
        protocol: 'https',
        get: (header: string) => {
          if (header === 'host') return 'example.com';
          return undefined;
        },
      };
      delete process.env.APP_URL;
    });

    it('should generate valid invitation link with UUID v4 token', () => {
      const result = generateInvitationLink(mockReq as Request, validUuid);
      expect(result).toBe(`https://example.com/accept-invitation?token=${validUuid}`);
    });

    it('should URL-encode token', () => {
      // UUIDs don't need encoding, but function defensively encodes anyway
      const result = generateInvitationLink(mockReq as Request, validUuid);
      expect(result).toContain('token=');
      expect(result).toBe(`https://example.com/accept-invitation?token=${encodeURIComponent(validUuid)}`);
    });

    it('should use APP_URL when set', () => {
      process.env.APP_URL = 'https://custom-domain.com';
      const result = generateInvitationLink(mockReq as Request, validUuid);
      expect(result).toBe(`https://custom-domain.com/accept-invitation?token=${validUuid}`);
    });

    it('should reject invalid token format - too short', () => {
      expect(() => {
        generateInvitationLink(mockReq as Request, '12345');
      }).toThrow('Invalid token format: token must be a valid UUID v4');
    });

    it('should reject invalid token format - wrong pattern', () => {
      expect(() => {
        generateInvitationLink(mockReq as Request, 'not-a-valid-uuid-format');
      }).toThrow('Invalid token format: token must be a valid UUID v4');
    });

    it('should reject invalid token format - special characters', () => {
      expect(() => {
        generateInvitationLink(mockReq as Request, '550e8400-e29b-41d4-a716-44665544000<script>');
      }).toThrow('Invalid token format: token must be a valid UUID v4');
    });

    it('should reject invalid token format - SQL injection attempt', () => {
      expect(() => {
        generateInvitationLink(mockReq as Request, "'; DROP TABLE users; --");
      }).toThrow('Invalid token format: token must be a valid UUID v4');
    });

    it('should reject invalid token format - wrong UUID version', () => {
      // UUID v1 (version bit should be 4 for v4)
      const uuidV1 = '550e8400-e29b-11d4-a716-446655440000';
      expect(() => {
        generateInvitationLink(mockReq as Request, uuidV1);
      }).toThrow('Invalid token format: token must be a valid UUID v4');
    });

    it('should accept valid UUID v4 with uppercase letters', () => {
      const uppercaseUuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = generateInvitationLink(mockReq as Request, uppercaseUuid);
      expect(result).toBe(`https://example.com/accept-invitation?token=${uppercaseUuid}`);
    });

    it('should accept valid UUID v4 with variant bits 8-b', () => {
      // Test all valid variant bits (8, 9, a, b)
      const variants = ['8', '9', 'a', 'b'];
      variants.forEach(variant => {
        const uuid = `550e8400-e29b-41d4-${variant}716-446655440000`;
        const result = generateInvitationLink(mockReq as Request, uuid);
        expect(result).toContain(`token=${uuid}`);
      });
    });

    it('should reject UUID with invalid variant bit', () => {
      // Variant bit must be 8, 9, a, or b (not c, d, e, f)
      const invalidUuid = '550e8400-e29b-41d4-c716-446655440000';
      expect(() => {
        generateInvitationLink(mockReq as Request, invalidUuid);
      }).toThrow('Invalid token format: token must be a valid UUID v4');
    });

    it('should handle trailing slash in base URL', () => {
      process.env.APP_URL = 'https://example.com/';
      const result = generateInvitationLink(mockReq as Request, validUuid);
      expect(result).toBe(`https://example.com/accept-invitation?token=${validUuid}`);
    });
  });
});
