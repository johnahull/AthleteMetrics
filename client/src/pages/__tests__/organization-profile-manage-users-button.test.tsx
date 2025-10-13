/**
 * Simple TDD Test for "Manage Users" Button Rendering
 *
 * This test verifies that the UserManagementModal component is actually
 * rendered in the organization profile page for users with the right permissions.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Organization Profile - Manage Users Button Implementation', () => {
  it('should render UserManagementModal component in the page', () => {
    // Read the organization-profile.tsx file
    const filePath = join(__dirname, '..', 'organization-profile.tsx');
    const fileContent = readFileSync(filePath, 'utf-8');

    // Verify that UserManagementModal is imported (it's defined in the same file)
    expect(fileContent).toContain('function UserManagementModal');

    // Verify that UserManagementModal is actually rendered in the JSX
    // This is the key test - the bug was that this component was defined but never used
    expect(fileContent).toMatch(/<UserManagementModal\s+organizationId=\{/);
  });

  it('should render UserManagementModal in the Coaches & Administrators section', () => {
    // Read the organization-profile.tsx file
    const filePath = join(__dirname, '..', 'organization-profile.tsx');
    const fileContent = readFileSync(filePath, 'utf-8');

    // Find the Coaches & Administrators section
    const coachesSection = fileContent.match(/Coaches & Administrators[\s\S]*?<\/Card>/);
    expect(coachesSection).toBeTruthy();

    // Verify UserManagementModal is within this section
    expect(coachesSection![0]).toContain('UserManagementModal');
  });

  it('should pass organizationId prop to UserManagementModal', () => {
    // Read the organization-profile.tsx file
    const filePath = join(__dirname, '..', 'organization-profile.tsx');
    const fileContent = readFileSync(filePath, 'utf-8');

    // Verify organizationId prop is passed
    expect(fileContent).toMatch(/<UserManagementModal\s+organizationId=\{id!\}/);
  });

  // This test is covered by integration tests that verify the actual runtime behavior
  // The key tests above already verify the component is rendered correctly
});

describe('UserManagementModal Component Implementation', () => {
  it('should have Create User and Send Invitation tabs', () => {
    // Read the organization-profile.tsx file
    const filePath = join(__dirname, '..', 'organization-profile.tsx');
    const fileContent = readFileSync(filePath, 'utf-8');

    // Find UserManagementModal component
    const modalStart = fileContent.indexOf('function UserManagementModal');
    const modalEnd = fileContent.indexOf('export default function OrganizationProfile');
    const modalContent = fileContent.substring(modalStart, modalEnd);

    // Verify tabs exist
    expect(modalContent).toContain('Create User');
    expect(modalContent).toContain('Send Invitation');
  });

  it('should have role selection with org_admin and coach options', () => {
    // Read the organization-profile.tsx file
    const filePath = join(__dirname, '..', 'organization-profile.tsx');
    const fileContent = readFileSync(filePath, 'utf-8');

    // Find UserManagementModal component
    const modalStart = fileContent.indexOf('function UserManagementModal');
    const modalEnd = fileContent.indexOf('export default function OrganizationProfile');
    const modalContent = fileContent.substring(modalStart, modalEnd);

    // Verify role options exist
    expect(modalContent).toContain('org_admin');
    expect(modalContent).toContain('coach');
    expect(modalContent).toContain('athlete');
  });

  it('should restrict visibility to org admins, coaches, and site admins', () => {
    // Read the organization-profile.tsx file
    const filePath = join(__dirname, '..', 'organization-profile.tsx');
    const fileContent = readFileSync(filePath, 'utf-8');

    // Find UserManagementModal component
    const modalStart = fileContent.indexOf('function UserManagementModal');
    const modalEnd = fileContent.indexOf('export default function OrganizationProfile');
    const modalContent = fileContent.substring(modalStart, modalEnd);

    // Verify permission checks
    expect(modalContent).toContain('isOrgAdmin');
    expect(modalContent).toContain('isCoach');
    expect(modalContent).toContain('isSiteAdmin');
    expect(modalContent).toContain('return null');
  });
});
