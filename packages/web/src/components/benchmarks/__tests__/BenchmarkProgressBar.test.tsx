/**
 * Tests for BenchmarkProgressBar component
 * Verifies progress display for range-based benchmarks
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BenchmarkProgressBar } from '../BenchmarkProgressBar';

describe('BenchmarkProgressBar', () => {
  describe('Traditional Operators (lte, gte, eq)', () => {
    it('displays progress for lte operator', () => {
      render(
        <BenchmarkProgressBar
          progress={110}
          isMet={true}
          comparisonOperator="lte"
        />
      );

      expect(screen.getByText('Progress')).toBeInTheDocument();
      expect(screen.getByText(/110% \(Exceeding Goal\)/i)).toBeInTheDocument();
    });

    it('displays progress for gte operator', () => {
      render(
        <BenchmarkProgressBar
          progress={85}
          isMet={false}
          comparisonOperator="gte"
        />
      );

      expect(screen.getByText(/85% of Goal/i)).toBeInTheDocument();
    });

    it('displays exact match for eq operator', () => {
      render(
        <BenchmarkProgressBar
          progress={100}
          isMet={true}
          comparisonOperator="eq"
        />
      );

      expect(screen.getByText(/Exact Match/i)).toBeInTheDocument();
    });

    it('displays partial match for eq operator when not met', () => {
      render(
        <BenchmarkProgressBar
          progress={0}
          isMet={false}
          comparisonOperator="eq"
        />
      );

      expect(screen.getByText(/0% Match/i)).toBeInTheDocument();
    });
  });

  describe('Range Operator', () => {
    it('displays "Within Target Range" when progress is 100%', () => {
      render(
        <BenchmarkProgressBar
          progress={100}
          isMet={true}
          comparisonOperator="range"
        />
      );

      expect(screen.getByText('Progress')).toBeInTheDocument();
      expect(screen.getByText(/Within Target Range/i)).toBeInTheDocument();
    });

    it('displays percentage to range when progress < 100%', () => {
      render(
        <BenchmarkProgressBar
          progress={80}
          isMet={false}
          comparisonOperator="range"
        />
      );

      expect(screen.getByText(/80% to Range/i)).toBeInTheDocument();
    });

    it('displays "Within Target Range" even when progress > 100% if isMet is true', () => {
      render(
        <BenchmarkProgressBar
          progress={200}
          isMet={true}
          comparisonOperator="range"
        />
      );

      // For range benchmarks, if isMet is true, always show "Within Target Range"
      // regardless of progress value (backend controls isMet based on actual range)
      expect(screen.getByText(/Within Target Range/i)).toBeInTheDocument();
    });

    it('displays correct color when within range (met)', () => {
      const { container } = render(
        <BenchmarkProgressBar
          progress={100}
          isMet={true}
          comparisonOperator="range"
        />
      );

      // Check for green color class when met
      const progressBar = container.querySelector('.bg-green-600');
      expect(progressBar).toBeInTheDocument();
    });

    it('displays correct color when outside range (not met)', () => {
      const { container } = render(
        <BenchmarkProgressBar
          progress={75}
          isMet={false}
          comparisonOperator="range"
        />
      );

      // Check for yellow/orange color when close but not met
      const progressBar = container.querySelector('.bg-yellow-600');
      expect(progressBar).toBeInTheDocument();
    });
  });

  describe('Progress Bar Visual', () => {
    it('renders progress bar with correct width', () => {
      const { container } = render(
        <BenchmarkProgressBar
          progress={75}
          isMet={false}
          comparisonOperator="lte"
        />
      );

      const progressBar = container.querySelector('[style*="width"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('displays 100% goal line marker when progress > 100%', () => {
      const { container } = render(
        <BenchmarkProgressBar
          progress={120}
          isMet={true}
          comparisonOperator="gte"
        />
      );

      const goalLine = container.querySelector('[title="100% Goal Line"]');
      expect(goalLine).toBeInTheDocument();
    });

    it('does not display goal line when progress <= 100%', () => {
      const { container } = render(
        <BenchmarkProgressBar
          progress={85}
          isMet={false}
          comparisonOperator="gte"
        />
      );

      const goalLine = container.querySelector('[title="100% Goal Line"]');
      expect(goalLine).not.toBeInTheDocument();
    });
  });
});
