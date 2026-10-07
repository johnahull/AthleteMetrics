import { describe, it, expect } from 'vitest';
import { isSafePublicUrl } from '../url-safety';

describe('isSafePublicUrl reserved IPv4 ranges', () => {
  it.each([
    '224.0.0.1', // multicast 224.0.0.0/4
    '239.255.255.250',
    '240.0.0.1', // reserved 240.0.0.0/4
    '255.255.255.255', // limited broadcast
    '198.18.0.1', // benchmarking 198.18.0.0/15
    '198.19.255.254',
  ])('blocks https://%s', (ip) => {
    expect(isSafePublicUrl(`https://${ip}/clip`)).toBe(false);
  });

  it.each(['223.255.255.254', '198.17.0.1', '198.20.0.1', '8.8.8.8'])('still allows public https://%s', (ip) => {
    expect(isSafePublicUrl(`https://${ip}/clip`)).toBe(true);
  });

  it('does not block a DNS name that merely starts with those digits', () => {
    expect(isSafePublicUrl('https://224.example.com/clip')).toBe(true);
  });
});
