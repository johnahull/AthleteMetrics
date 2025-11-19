/**
 * Integration tests for organization type functionality
 * Simple validation that basic functionality works end-to-end
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { 
  OrganizationTypeSelector, 
  OrganizationTypeBadge,
  ORGANIZATION_TYPE_LABELS,
  getOrganizationTypeLabel 
} from '../components/organization-type-selector';

describe('Organization Type Integration', () => {
  describe('OrganizationTypeBadge', () => {
    it('should render badge with correct label', () => {
      render(<OrganizationTypeBadge orgType="high_school" />);
      
      expect(screen.getByText('High School')).toBeInTheDocument();
      expect(screen.getByTestId('org-type-badge-high_school')).toBeInTheDocument();
    });

    it('should render nothing for null orgType', () => {
      const { container } = render(<OrganizationTypeBadge orgType={null} />);
      
      expect(container.firstChild).toBeNull();
    });

    it('should render all organization types correctly', () => {
      Object.entries(ORGANIZATION_TYPE_LABELS).forEach(([key, label]) => {
        const { unmount } = render(<OrganizationTypeBadge orgType={key as any} />);
        
        expect(screen.getByText(label)).toBeInTheDocument();
        
        unmount();
      });
    });
  });

  describe('getOrganizationTypeLabel utility', () => {
    it('should return correct labels for all org types', () => {
      expect(getOrganizationTypeLabel('youth')).toBe('Youth/Recreational');
      expect(getOrganizationTypeLabel('high_school')).toBe('High School');
      expect(getOrganizationTypeLabel('college')).toBe('College/University');
      expect(getOrganizationTypeLabel('club')).toBe('Club/Travel Team');
      expect(getOrganizationTypeLabel('private_facility')).toBe('Private Coach/Training Facility');
      expect(getOrganizationTypeLabel('elite_academy')).toBe('Elite Academy');
    });

    it('should handle invalid/missing values', () => {
      expect(getOrganizationTypeLabel(null)).toBe('Unknown');
      expect(getOrganizationTypeLabel(undefined)).toBe('Unknown');
      expect(getOrganizationTypeLabel('invalid' as any)).toBe('Unknown');
    });
  });

  describe('ORGANIZATION_TYPE_LABELS constant', () => {
    it('should have all required organization types', () => {
      const expectedTypes = ['youth', 'high_school', 'college', 'club', 'private_facility', 'elite_academy'];
      
      expectedTypes.forEach(type => {
        expect(ORGANIZATION_TYPE_LABELS).toHaveProperty(type);
        expect(typeof ORGANIZATION_TYPE_LABELS[type as keyof typeof ORGANIZATION_TYPE_LABELS]).toBe('string');
      });
    });

    it('should have human-readable labels', () => {
      Object.values(ORGANIZATION_TYPE_LABELS).forEach(label => {
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toMatch(/[_]/); // No underscores in display labels
      });
    });
  });
});