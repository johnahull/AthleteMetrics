import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import {
  TrendIndicator,
  StatusBreakdownBadges,
  StatusDot,
  ScoreDisplay,
} from '../WellnessUIComponents';

describe('TrendIndicator', () => {
  test('renders "Improving" with green color for up trend', () => {
    render(<TrendIndicator trend="up" />);
    const element = screen.getByText('Improving');
    expect(element).toBeInTheDocument();
    expect(element).toHaveClass('text-green-700');
  });

  test('renders "Declining" with red color for down trend', () => {
    render(<TrendIndicator trend="down" />);
    const element = screen.getByText('Declining');
    expect(element).toBeInTheDocument();
    expect(element).toHaveClass('text-red-600');
  });

  test('renders "Stable" with gray color for stable trend', () => {
    render(<TrendIndicator trend="stable" />);
    const element = screen.getByText('Stable');
    expect(element).toBeInTheDocument();
    expect(element).toHaveClass('text-gray-600');
  });

  test('shows TrendingUp icon for up trend', () => {
    const { container } = render(<TrendIndicator trend="up" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('text-green-700');
  });

  test('shows TrendingDown icon for down trend', () => {
    const { container } = render(<TrendIndicator trend="down" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('text-red-600');
  });

  test('shows Minus icon for stable trend', () => {
    const { container } = render(<TrendIndicator trend="stable" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('text-gray-600');
  });
});

describe('StatusBreakdownBadges', () => {
  test('only renders red badge when only red count is provided', () => {
    render(<StatusBreakdownBadges red={5} />);
    expect(screen.getByText('5 Red')).toBeInTheDocument();
    expect(screen.queryByText(/Yellow/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Green/)).not.toBeInTheDocument();
  });

  test('only renders yellow badge when only yellow count is provided', () => {
    render(<StatusBreakdownBadges yellow={3} />);
    expect(screen.getByText('3 Yellow')).toBeInTheDocument();
    expect(screen.queryByText(/Red/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Green/)).not.toBeInTheDocument();
  });

  test('only renders green badge when only green count is provided', () => {
    render(<StatusBreakdownBadges green={8} />);
    expect(screen.getByText('8 Green')).toBeInTheDocument();
    expect(screen.queryByText(/Red/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Yellow/)).not.toBeInTheDocument();
  });

  test('renders all three badges when all counts are provided', () => {
    render(<StatusBreakdownBadges red={2} yellow={4} green={10} />);
    expect(screen.getByText('2 Red')).toBeInTheDocument();
    expect(screen.getByText('4 Yellow')).toBeInTheDocument();
    expect(screen.getByText('10 Green')).toBeInTheDocument();
  });

  test('does not render badges for zero counts', () => {
    render(<StatusBreakdownBadges red={0} yellow={0} green={5} />);
    expect(screen.queryByText(/Red/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Yellow/)).not.toBeInTheDocument();
    expect(screen.getByText('5 Green')).toBeInTheDocument();
  });

  test('renders nothing when all counts are zero', () => {
    const { container } = render(<StatusBreakdownBadges red={0} yellow={0} green={0} />);
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  test('renders nothing when no counts are provided', () => {
    const { container } = render(<StatusBreakdownBadges />);
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  test('red badge has destructive variant styling', () => {
    render(<StatusBreakdownBadges red={3} />);
    const badge = screen.getByText('3 Red');
    expect(badge).toHaveClass('bg-destructive');
  });

  test('yellow badge has outline variant with yellow styling', () => {
    render(<StatusBreakdownBadges yellow={2} />);
    const badge = screen.getByText('2 Yellow');
    expect(badge).toHaveClass('bg-yellow-50');
    expect(badge).toHaveClass('text-yellow-700');
    expect(badge).toHaveClass('border-yellow-200');
  });

  test('green badge has outline variant with green styling', () => {
    render(<StatusBreakdownBadges green={7} />);
    const badge = screen.getByText('7 Green');
    expect(badge).toHaveClass('bg-green-50');
    expect(badge).toHaveClass('text-green-700');
    expect(badge).toHaveClass('border-green-200');
  });
});

describe('StatusDot', () => {
  test('renders red dot with correct background color', () => {
    const { container } = render(<StatusDot status="red" />);
    const dot = container.querySelector('.bg-red-500');
    expect(dot).toBeInTheDocument();
  });

  test('renders yellow dot with correct background color', () => {
    const { container } = render(<StatusDot status="yellow" />);
    const dot = container.querySelector('.bg-yellow-500');
    expect(dot).toBeInTheDocument();
  });

  test('renders green dot with correct background color', () => {
    const { container } = render(<StatusDot status="green" />);
    const dot = container.querySelector('.bg-green-500');
    expect(dot).toBeInTheDocument();
  });

  test('has proper aria-label for accessibility', () => {
    render(<StatusDot status="red" />);
    const dot = screen.getByLabelText('Status: red');
    expect(dot).toBeInTheDocument();
  });

  test('is circular with correct size', () => {
    const { container } = render(<StatusDot status="green" />);
    const dot = container.querySelector('.w-3.h-3.rounded-full');
    expect(dot).toBeInTheDocument();
  });
});

describe('ScoreDisplay', () => {
  test('formats score with one decimal place', () => {
    render(<ScoreDisplay score={7.567} max={10} />);
    expect(screen.getByText(/7.6/)).toBeInTheDocument();
  });

  test('shows max value', () => {
    render(<ScoreDisplay score={8.2} max={10} />);
    expect(screen.getByText(/\/ 10/)).toBeInTheDocument();
  });

  test('score is bold and max is not', () => {
    const { container } = render(<ScoreDisplay score={5.5} max={10} />);
    const boldText = container.querySelector('.font-bold');
    expect(boldText).toHaveTextContent('5.5');
  });

  test('shows "N/A" for null score', () => {
    render(<ScoreDisplay score={null} max={10} />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(screen.queryByText(/\/ 10/)).not.toBeInTheDocument();
  });

  test('applies custom className', () => {
    const { container } = render(<ScoreDisplay score={6.0} max={10} className="custom-class" />);
    const element = container.querySelector('.custom-class');
    expect(element).toBeInTheDocument();
  });

  test('formats whole numbers with one decimal place', () => {
    render(<ScoreDisplay score={8} max={10} />);
    expect(screen.getByText(/8.0/)).toBeInTheDocument();
  });

  test('handles zero score', () => {
    render(<ScoreDisplay score={0} max={10} />);
    expect(screen.getByText(/0.0/)).toBeInTheDocument();
  });

  test('handles different max values', () => {
    render(<ScoreDisplay score={3.5} max={5} />);
    expect(screen.getByText(/\/ 5/)).toBeInTheDocument();
  });
});
