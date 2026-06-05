import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { PromotionDialog } from './PromotionDialog';

describe('PromotionDialog', () => {
  it('renders queen, rook, bishop, and knight choices', () => {
    render(
      <PromotionDialog
        choices={['queen', 'rook', 'bishop', 'knight']}
        onChoose={() => {}}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Promote to queen' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Promote to rook' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Promote to bishop' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Promote to knight' }),
    ).toBeInTheDocument();
  });

  it('calls onChoose with the selected piece', () => {
    const onChoose = vi.fn();

    render(
      <PromotionDialog
        choices={['queen', 'rook', 'bishop', 'knight']}
        onChoose={onChoose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Promote to queen' }));

    expect(onChoose).toHaveBeenCalledWith('queen');
  });

  it('supports cancellation when onCancel is provided', () => {
    const onCancel = vi.fn();

    render(
      <PromotionDialog
        choices={['queen', 'rook', 'bishop', 'knight']}
        onCancel={onCancel}
        onChoose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel promotion' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
