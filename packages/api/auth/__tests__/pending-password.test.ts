import { describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { INVITATION_PENDING_PASSWORD } from '@shared/schema';
import { passwordSchema, changePasswordSchema } from '@shared/password-validation';
import { validatePassword } from '@shared/password-requirements';
import { verifyUserPassword, isPasswordPending } from '../pending-password';

const PLACEHOLDER = INVITATION_PENDING_PASSWORD;

describe('accounts without a set password cannot sign in with a password', () => {
  it('never verifies the placeholder against a hash of the placeholder (older rows)', async () => {
    const stored = await bcrypt.hash(PLACEHOLDER, 4);
    expect(await verifyUserPassword(PLACEHOLDER, stored)).toBe(false);
  });

  it('never verifies anything against the unhashed placeholder (new rows)', async () => {
    expect(await verifyUserPassword(PLACEHOLDER, PLACEHOLDER)).toBe(false);
    expect(await verifyUserPassword('Anything123!x', PLACEHOLDER)).toBe(false);
  });

  it('never verifies against a missing password', async () => {
    expect(await verifyUserPassword('Anything123!x', null)).toBe(false);
    expect(await verifyUserPassword('Anything123!x', undefined)).toBe(false);
  });

  it('returns false instead of throwing when either value is not a string', async () => {
    const stored = await bcrypt.hash('RealPass123!x', 4);
    expect(await verifyUserPassword({} as any, stored)).toBe(false);
    expect(await verifyUserPassword(['RealPass123!x'] as any, stored)).toBe(false);
    expect(await verifyUserPassword(12345 as any, stored)).toBe(false);
    expect(await verifyUserPassword('RealPass123!x', 42 as any)).toBe(false);
  });

  it('verifies a real password and rejects a wrong one', async () => {
    const stored = await bcrypt.hash('RealPass123!x', 4);
    expect(await verifyUserPassword('RealPass123!x', stored)).toBe(true);
    expect(await verifyUserPassword('WrongPass123!x', stored)).toBe(false);
    expect(await verifyUserPassword('', stored)).toBe(false);
  });

  it('treats the placeholder and a hash of it as not yet set, and nothing else', async () => {
    expect(await isPasswordPending(PLACEHOLDER)).toBe(true);
    expect(await isPasswordPending(await bcrypt.hash(PLACEHOLDER, 4))).toBe(true);
    expect(await isPasswordPending(await bcrypt.hash('RealPass123!x', 4))).toBe(false);
    expect(await isPasswordPending(null)).toBe(false);
  });
});

describe('the placeholder cannot be chosen as a password', () => {
  it('is rejected by validatePassword', () => {
    expect(validatePassword(PLACEHOLDER).valid).toBe(false);
  });

  it('is rejected by passwordSchema and changePasswordSchema', () => {
    expect(passwordSchema.safeParse(PLACEHOLDER).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: PLACEHOLDER, confirmPassword: PLACEHOLDER }).success).toBe(false);
  });
});
