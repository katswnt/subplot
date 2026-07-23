import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import OptimizerControls from '../../src/components/OptimizerControls';

const baseProps = {
  region: 'US',
  ownedServices: [] as string[],
  includeLibraryFree: true,
  adPolicy: 'cheapest' as const,
  objective: 'value' as const,
  budget: null as number | null,
  ownedTier: {} as Record<string, string>,
  editingTier: null as string | null,
  onToggleOwned: () => {},
  onToggleLibrary: () => {},
  onAdPolicyChange: () => {},
  onObjectiveChange: () => {},
  onBudgetChange: () => {},
  onRegionChange: () => {},
  onEditTier: () => {},
  onSetTier: () => {},
};

describe('OptimizerControls', () => {
  it('toggles an owned service by canonical slug', () => {
    const onToggleOwned = vi.fn();
    render(<OptimizerControls {...baseProps} onToggleOwned={onToggleOwned} />);
    fireEvent.click(screen.getByRole('button', { name: /Netflix/ }));
    expect(onToggleOwned).toHaveBeenCalledWith('netflix');
  });

  it('toggles the library-card option', () => {
    const onToggleLibrary = vi.fn();
    render(<OptimizerControls {...baseProps} onToggleLibrary={onToggleLibrary} />);
    fireEvent.click(screen.getByRole('button', { name: /library card/i }));
    expect(onToggleLibrary).toHaveBeenCalledOnce();
  });

  it('offers a 3-way ad policy segmented control', () => {
    const onAdPolicyChange = vi.fn();
    render(<OptimizerControls {...baseProps} onAdPolicyChange={onAdPolicyChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^No ads$/i }));
    expect(onAdPolicyChange).toHaveBeenCalledWith('noads');
    fireEvent.click(screen.getByRole('button', { name: /^Ad-free$/i }));
    expect(onAdPolicyChange).toHaveBeenCalledWith('adfree');
  });

  it('shows a credited caption + tier picker for an owned multi-tier service', () => {
    const onSetTier = vi.fn();
    render(<OptimizerControls {...baseProps} ownedServices={['netflix']} editingTier="netflix" onSetTier={onSetTier} />);
    // The tier radio is open; picking Netflix's "Standard" (ad-free) tier fires onSetTier.
    fireEvent.click(screen.getByRole('button', { name: /Standard/i }));
    expect(onSetTier).toHaveBeenCalledWith('netflix', 'adfree');
  });

  it('offers the "Optimize for" objective control', () => {
    const onObjectiveChange = vi.fn();
    render(<OptimizerControls {...baseProps} onObjectiveChange={onObjectiveChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Most coverage/i }));
    expect(onObjectiveChange).toHaveBeenCalledWith('coverage');
    fireEvent.click(screen.getByRole('button', { name: /Fewest services/i }));
    expect(onObjectiveChange).toHaveBeenCalledWith('fewest');
  });

  it('budget cap toggles on and reveals the slider', () => {
    const onBudgetChange = vi.fn();
    const { rerender } = render(<OptimizerControls {...baseProps} onBudgetChange={onBudgetChange} />);
    // Off by default → no slider.
    expect(screen.queryByLabelText(/^Budget$/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Off$/i }));
    expect(onBudgetChange).toHaveBeenCalledWith(20); // turning on sets a default
    // When on, the slider is present.
    rerender(<OptimizerControls {...baseProps} budget={20} onBudgetChange={onBudgetChange} />);
    fireEvent.change(screen.getByLabelText(/^Budget$/i), { target: { value: '35' } });
    expect(onBudgetChange).toHaveBeenCalledWith(35);
  });

  it('hides the region selector unless asked (region change needs a re-fetch)', () => {
    const { rerender } = render(<OptimizerControls {...baseProps} />);
    expect(screen.queryByLabelText(/Region/i)).toBeNull();
    // US-only today, so even showRegion doesn't render a picker (1 region).
    rerender(<OptimizerControls {...baseProps} showRegion />);
    expect(screen.queryByLabelText(/Region/i)).toBeNull();
  });
});
