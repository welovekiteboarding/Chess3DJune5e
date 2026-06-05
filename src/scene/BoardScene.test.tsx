import { fireEvent, render, screen } from '@testing-library/react';

import type { ChessSquare } from '../chess/chessTypes';
import {
  BoardScene,
  type BoardSceneCanvasProps,
  type BoardScenePiecePlacement,
} from './BoardScene';

function TestCanvasBoundary({ children }: BoardSceneCanvasProps) {
  return <div data-testid="board-scene-canvas">{children}</div>;
}

describe('BoardScene', () => {
  it('renders a testable 3D board shell with stable square controls', () => {
    const handleSquareSelect = vi.fn();
    const legalDestinationSquares: ChessSquare[] = ['e4', 'e5', 'f4'];
    const piecePlacements: BoardScenePiecePlacement[] = [
      { square: 'e2', piece: 'pawn', color: 'white' },
      { square: 'e7', piece: 'pawn', color: 'black' },
      { square: 'g1', piece: 'knight', color: 'white' },
    ];

    render(
      <BoardScene
        CanvasBoundary={TestCanvasBoundary}
        legalDestinationSquares={legalDestinationSquares}
        onSquareSelect={handleSquareSelect}
        piecePlacements={piecePlacements}
        selectedSquare="e2"
      />,
    );

    expect(screen.getByTestId('board-scene-canvas')).toBeInTheDocument();
    expect(
      screen.getByRole('grid', { name: 'Chess board squares' }),
    ).toBeInTheDocument();

    const squareButtons = screen.getAllByRole('button', { name: /square$/i });
    expect(squareButtons).toHaveLength(64);

    expect(screen.getByRole('button', { name: 'e2 square' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'e4 square' })).toHaveAttribute(
      'data-legal-destination',
      'true',
    );
    expect(screen.getByText('white pawn on e2')).toBeInTheDocument();
    expect(screen.getByText('black pawn on e7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'f4 square' }));

    expect(handleSquareSelect).toHaveBeenCalledWith('f4');
    expect(handleSquareSelect).toHaveBeenCalledTimes(1);
  });
});
