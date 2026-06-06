import { fireEvent, render, screen, within } from '@testing-library/react';

import type { ChessPiecePlacement, ChessSquare } from '../chess/chessTypes';
import {
  createInitialGameState,
  getFen,
  getPiecePlacementsFromFen,
} from '../chess/chessRules';
import { BoardScene, type BoardSceneCanvasProps } from './BoardScene';

function TestCanvasBoundary({ children, className }: BoardSceneCanvasProps) {
  return (
    <div className={className} data-testid="board-scene-canvas">
      {children}
    </div>
  );
}

describe('BoardScene', () => {
  it('renders a testable 3D board shell with stable square controls', () => {
    const handleSquareSelect = vi.fn();
    const legalDestinationSquares: ChessSquare[] = ['e4', 'e5', 'f4'];
    const piecePlacements: ChessPiecePlacement[] = [
      { renderId: 'white-pawn-e2', square: 'e2', piece: 'pawn', color: 'white' },
      { renderId: 'black-pawn-e7', square: 'e7', piece: 'pawn', color: 'black' },
      {
        renderId: 'white-knight-g1',
        square: 'g1',
        piece: 'knight',
        color: 'white',
      },
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
    expect(screen.getByTestId('board-scene-canvas-shell')).toBeInTheDocument();
    expect(screen.getByTestId('board-scene-canvas')).toHaveClass(
      'board-scene-canvas',
    );
    expect(
      screen.getByRole('grid', { name: 'Chess board squares' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('board-scene-fallback')).toBeInTheDocument();

    const squareButtons = screen.getAllByRole('button', { name: /square$/i });
    expect(squareButtons).toHaveLength(64);
    expect(
      within(screen.getByTestId('board-scene-square-controls')).getByRole(
        'button',
        { name: 'e2 square' },
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'e2 square' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('legal-destination-square-e4')).toHaveAttribute(
      'data-square',
      'e4',
    );
    expect(screen.getByTestId('legal-destination-square-e5')).toHaveAttribute(
      'data-square',
      'e5',
    );
    expect(screen.queryByTestId('legal-destination-square-e2')).not.toBeInTheDocument();
    expect(screen.getByText('white pawn on e2')).toBeInTheDocument();
    expect(screen.getByText('black pawn on e7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'f4 square' }));

    expect(handleSquareSelect).toHaveBeenCalledWith('f4');
    expect(handleSquareSelect).toHaveBeenCalledTimes(1);
  });

  it('keeps square controls in the fallback region instead of a visible overlay', () => {
    render(
      <BoardScene
        CanvasBoundary={TestCanvasBoundary}
        legalDestinationSquares={[]}
        selectedSquare={null}
      />,
    );

    const fallback = screen.getByTestId('board-scene-fallback');
    const squareGrid = within(fallback).getByRole('grid', {
      name: 'Chess board squares',
    });

    expect(squareGrid).toHaveStyle({
      position: 'absolute',
      width: '1px',
      height: '1px',
    });
    expect(
      screen.queryByTestId('board-scene-interaction-overlay'),
    ).not.toBeInTheDocument();
  });

  it('renders camera controls with overhead and reset actions', () => {
    render(
      <BoardScene
        CanvasBoundary={TestCanvasBoundary}
        legalDestinationSquares={[]}
        selectedSquare={null}
      />,
    );

    expect(
      screen.getByRole('toolbar', { name: 'Board camera controls' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('board-camera-state')).toHaveAttribute(
      'data-view-mode',
      'default',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Overhead view' }));

    expect(screen.getByTestId('board-camera-state')).toHaveAttribute(
      'data-view-mode',
      'overhead',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }));

    expect(screen.getByTestId('board-camera-state')).toHaveAttribute(
      'data-view-mode',
      'custom',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));

    expect(screen.getByTestId('board-camera-state')).toHaveAttribute(
      'data-view-mode',
      'default',
    );
  });

  it('renders one piece representation for every placement in the starting position', () => {
    const gameState = createInitialGameState();
    const piecePlacements = getPiecePlacementsFromFen(getFen(gameState));

    render(
      <BoardScene
        CanvasBoundary={TestCanvasBoundary}
        legalDestinationSquares={[]}
        piecePlacements={piecePlacements}
        selectedSquare={null}
      />,
    );

    const renderedPieces = screen.getAllByTestId('board-piece');

    expect(renderedPieces).toHaveLength(32);
    expect(screen.getByTestId('board-piece-white-king-e1')).toHaveAttribute(
      'data-square',
      'e1',
    );
    expect(screen.getByTestId('board-piece-black-king-e8')).toHaveAttribute(
      'data-square',
      'e8',
    );
  });

  it('removes structural legal-destination markers when no legal squares are provided', () => {
    const { rerender } = render(
      <BoardScene
        CanvasBoundary={TestCanvasBoundary}
        legalDestinationSquares={['e3', 'e4']}
        selectedSquare="e2"
      />,
    );

    expect(screen.getByTestId('legal-destination-square-e3')).toBeInTheDocument();
    expect(screen.getByTestId('legal-destination-square-e4')).toBeInTheDocument();

    rerender(
      <BoardScene
        CanvasBoundary={TestCanvasBoundary}
        legalDestinationSquares={[]}
        selectedSquare={null}
      />,
    );

    expect(screen.queryByTestId('legal-destination-square-e3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('legal-destination-square-e4')).not.toBeInTheDocument();
  });
});
