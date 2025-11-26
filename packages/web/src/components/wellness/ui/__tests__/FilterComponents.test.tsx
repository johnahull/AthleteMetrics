import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateRangeInput, FilterBadge } from '../FilterComponents';

describe('DateRangeInput', () => {
  it('should render two date inputs with labels', () => {
    render(
      <DateRangeInput
        fromDate="2024-01-01"
        toDate="2024-12-31"
        onFromDateChange={vi.fn()}
        onToDateChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('should display correct values in date inputs', () => {
    render(
      <DateRangeInput
        fromDate="2024-01-01"
        toDate="2024-12-31"
        onFromDateChange={vi.fn()}
        onToDateChange={vi.fn()}
      />
    );

    const fromInput = screen.getByLabelText('From') as HTMLInputElement;
    const toInput = screen.getByLabelText('To') as HTMLInputElement;

    expect(fromInput.value).toBe('2024-01-01');
    expect(toInput.value).toBe('2024-12-31');
  });

  it('should call onFromDateChange when from date changes', async () => {
    const user = userEvent.setup();
    const onFromDateChange = vi.fn();

    render(
      <DateRangeInput
        fromDate="2024-01-01"
        toDate="2024-12-31"
        onFromDateChange={onFromDateChange}
        onToDateChange={vi.fn()}
      />
    );

    const fromInput = screen.getByLabelText('From');
    await user.clear(fromInput);
    await user.type(fromInput, '2024-02-01');

    expect(onFromDateChange).toHaveBeenCalled();
  });

  it('should call onToDateChange when to date changes', async () => {
    const user = userEvent.setup();
    const onToDateChange = vi.fn();

    render(
      <DateRangeInput
        fromDate="2024-01-01"
        toDate="2024-12-31"
        onFromDateChange={vi.fn()}
        onToDateChange={onToDateChange}
      />
    );

    const toInput = screen.getByLabelText('To');
    await user.clear(toInput);
    await user.type(toInput, '2024-11-30');

    expect(onToDateChange).toHaveBeenCalled();
  });

  it('should have correct input type attributes', () => {
    render(
      <DateRangeInput
        fromDate="2024-01-01"
        toDate="2024-12-31"
        onFromDateChange={vi.fn()}
        onToDateChange={vi.fn()}
      />
    );

    const fromInput = screen.getByLabelText('From');
    const toInput = screen.getByLabelText('To');

    expect(fromInput).toHaveAttribute('type', 'date');
    expect(toInput).toHaveAttribute('type', 'date');
  });
});

describe('FilterBadge', () => {
  it('should render label text', () => {
    render(<FilterBadge label="Test Filter" onRemove={vi.fn()} />);

    expect(screen.getByText('Test Filter')).toBeInTheDocument();
  });

  it('should call onRemove when X button clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(<FilterBadge label="Test Filter" onRemove={onRemove} />);

    const removeButton = screen.getByRole('button', { name: /remove test filter/i });
    await user.click(removeButton);

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('should have proper aria-label', () => {
    render(<FilterBadge label="Test Filter" onRemove={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Remove Test Filter filter' })).toBeInTheDocument();
  });

  it('should render X icon', () => {
    render(<FilterBadge label="Test Filter" onRemove={vi.fn()} />);

    const removeButton = screen.getByRole('button', { name: /remove test filter/i });
    expect(removeButton.querySelector('svg')).toBeInTheDocument();
  });

  it('should render multiple badges independently', () => {
    const onRemove1 = vi.fn();
    const onRemove2 = vi.fn();

    const { container } = render(
      <div>
        <FilterBadge label="Filter 1" onRemove={onRemove1} />
        <FilterBadge label="Filter 2" onRemove={onRemove2} />
      </div>
    );

    expect(screen.getByText('Filter 1')).toBeInTheDocument();
    expect(screen.getByText('Filter 2')).toBeInTheDocument();
  });
});
