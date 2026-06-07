import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

import type { ChessPiecePlacement, ChessSquare } from '../chess/chessTypes';
import {
  createInitialGameState,
  getFen,
  getPiecePlacementsFromFen,
} from '../chess/chessRules';
import { BoardScene, type BoardSceneCanvasProps } from './BoardScene';

const expectedSceneTestWarnings = [
  'THREE.WARNING: Multiple instances of Three.js being imported.',
  'The tag <',
  'is unrecognized in this browser.',
  'is using incorrect casing.',
  'non-boolean attribute `transparent`',
  'React does not recognize the `',
] as const;

function isExpectedSceneTestWarning(message: string) {
  return expectedSceneTestWarnings.some((warningFragment) =>
    message.includes(warningFragment),
  );
}

function formatConsoleMessage(messageParts: unknown[]) {
  return messageParts
    .map((messagePart) =>
      typeof messagePart === 'string'
        ? messagePart
        : messagePart instanceof Error
          ? messagePart.message
          : String(messagePart),
    )
    .join(' ');
}

function suppressExpectedSceneWarnings(
  consoleMethod: 'error' | 'warn',
) {
  const originalConsoleMethod = console[consoleMethod];

  return vi
    .spyOn(console, consoleMethod)
    .mockImplementation((...messageParts: Parameters<typeof originalConsoleMethod>) => {
      const message = formatConsoleMessage(messageParts);

      if (isExpectedSceneTestWarning(message)) {
        return;
      }

      originalConsoleMethod(...messageParts);
    });
}

beforeEach(() => {
  suppressExpectedSceneWarnings('error');
  suppressExpectedSceneWarnings('warn');
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

function TestCanvasBoundary({ className }: BoardSceneCanvasProps) {
  return (
    <div className={className} data-testid="board-scene-canvas" />
  );
}

function InteractiveTestCanvasBoundary({
  cameraView,
  className,
  onCameraViewChange,
}: BoardSceneCanvasProps) {
  return (
    <div
      className={className}
      data-azimuth={cameraView?.azimuth}
      data-distance={cameraView?.distance}
      data-polar={cameraView?.polar}
      data-testid="interactive-board-scene-canvas"
      data-view-mode={cameraView?.viewMode}
    >
      <button
        onClick={() =>
          onCameraViewChange?.({
            azimuth: 0.9,
            distance: 5.2,
            polar: 0.52,
            viewMode: 'custom',
          })
        }
        type="button"
      >
        Simulate orbit update
      </button>
    </div>
  );
}

function SceneTestCanvasBoundary({ children, className }: BoardSceneCanvasProps) {
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

  it('applies camera button actions from the latest manual orbit state', () => {
    render(
      <BoardScene
        CanvasBoundary={InteractiveTestCanvasBoundary}
        legalDestinationSquares={[]}
        selectedSquare={null}
      />,
    );

    const canvas = screen.getByTestId('interactive-board-scene-canvas');

    expect(Number(canvas.getAttribute('data-distance'))).toBeCloseTo(10.4, 2);

    fireEvent.click(screen.getByRole('button', { name: 'Simulate orbit update' }));

    expect(canvas).toHaveAttribute('data-view-mode', 'custom');
    expect(Number(canvas.getAttribute('data-distance'))).toBeCloseTo(5.2, 5);
    expect(Number(canvas.getAttribute('data-azimuth'))).toBeCloseTo(0.9, 5);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));

    expect(Number(canvas.getAttribute('data-distance'))).toBeGreaterThan(5.2);
    expect(Number(canvas.getAttribute('data-distance'))).toBeLessThan(7);

    fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }));

    expect(Number(canvas.getAttribute('data-azimuth'))).toBeLessThan(0.9);

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));

    expect(canvas).toHaveAttribute('data-view-mode', 'default');
    expect(Number(canvas.getAttribute('data-distance'))).toBeCloseTo(10.4, 2);
  });

  it('updates camera distance from wheel input and lets reset restore the default zoom', () => {
    render(
      <BoardScene
        CanvasBoundary={InteractiveTestCanvasBoundary}
        legalDestinationSquares={[]}
        selectedSquare={null}
      />,
    );

    const canvas = screen.getByTestId('interactive-board-scene-canvas');
    const canvasShell = screen.getByTestId('board-scene-canvas-shell');

    expect(Number(canvas.getAttribute('data-distance'))).toBeCloseTo(10.4, 2);

    fireEvent.wheel(canvasShell, { deltaMode: WheelEvent.DOM_DELTA_PIXEL, deltaY: 180 });

    const zoomedOutDistance = Number(canvas.getAttribute('data-distance'));

    expect(zoomedOutDistance).toBeGreaterThan(10.4);
    expect(canvas).toHaveAttribute('data-view-mode', 'custom');

    fireEvent.wheel(canvasShell, { deltaMode: WheelEvent.DOM_DELTA_PIXEL, deltaY: -260 });

    const zoomedInDistance = Number(canvas.getAttribute('data-distance'));

    expect(zoomedInDistance).toBeLessThan(zoomedOutDistance);

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));

    expect(canvas).toHaveAttribute('data-view-mode', 'default');
    expect(Number(canvas.getAttribute('data-distance'))).toBeCloseTo(10.4, 2);
  });

  it('publishes deterministic camera bounds and clamps button zoom within them', () => {
    render(
      <BoardScene
        CanvasBoundary={InteractiveTestCanvasBoundary}
        legalDestinationSquares={[]}
        selectedSquare={null}
      />,
    );

    const cameraState = screen.getByTestId('board-camera-state');
    const canvas = screen.getByTestId('interactive-board-scene-canvas');

    expect(cameraState).toHaveAttribute('data-min-distance', '3.6');
    expect(cameraState).toHaveAttribute('data-max-distance', '24');
    expect(cameraState).toHaveAttribute('data-screen-up-angle', '0');

    for (let zoomStep = 0; zoomStep < 20; zoomStep += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    }

    expect(Number(canvas.getAttribute('data-distance'))).toBeCloseTo(3.6, 5);

    for (let zoomStep = 0; zoomStep < 30; zoomStep += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    }

    expect(Number(canvas.getAttribute('data-distance'))).toBeCloseTo(24, 5);
  });

  it('keeps horizontal camera orbit unbounded across repeated full rotations', () => {
    render(
      <BoardScene
        CanvasBoundary={InteractiveTestCanvasBoundary}
        legalDestinationSquares={[]}
        selectedSquare={null}
      />,
    );

    const canvas = screen.getByTestId('interactive-board-scene-canvas');

    fireEvent.click(screen.getByRole('button', { name: 'Simulate orbit update' }));

    for (let rotationStep = 0; rotationStep < 16; rotationStep += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
    }

    expect(Number(canvas.getAttribute('data-azimuth'))).toBeGreaterThan(
      Math.PI * 2,
    );
    expect(canvas).toHaveAttribute('data-view-mode', 'custom');
  });

  it('does not tilt the board group to fake the camera angle', () => {
    const { container } = render(
      <BoardScene
        CanvasBoundary={SceneTestCanvasBoundary}
        legalDestinationSquares={[]}
        selectedSquare={null}
      />,
    );

    const boardGroup = container.querySelector('group');

    expect(boardGroup).not.toBeNull();
    expect(boardGroup).not.toHaveAttribute('rotation');
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

  it('renders deterministic visual identifiers for every piece type', () => {
    const piecePlacements: ChessPiecePlacement[] = [
      { renderId: 'white-king-e1', square: 'e1', piece: 'king', color: 'white' },
      {
        renderId: 'white-queen-d1',
        square: 'd1',
        piece: 'queen',
        color: 'white',
      },
      { renderId: 'white-rook-a1', square: 'a1', piece: 'rook', color: 'white' },
      {
        renderId: 'black-bishop-c8',
        square: 'c8',
        piece: 'bishop',
        color: 'black',
      },
      {
        renderId: 'black-knight-g8',
        square: 'g8',
        piece: 'knight',
        color: 'black',
      },
      { renderId: 'black-pawn-e7', square: 'e7', piece: 'pawn', color: 'black' },
    ];

    render(
      <BoardScene
        CanvasBoundary={TestCanvasBoundary}
        legalDestinationSquares={[]}
        piecePlacements={piecePlacements}
        selectedSquare={null}
      />,
    );

    expect(screen.getByTestId('board-piece-white-king-e1')).toHaveAttribute(
      'aria-label',
      'white king piece on e1',
    );
    expect(screen.getByTestId('board-piece-white-king-e1')).toHaveAttribute(
      'data-piece-marker',
      'cross-crown',
    );
    expect(screen.getByTestId('board-piece-white-queen-d1')).toHaveAttribute(
      'data-piece-marker',
      'crown',
    );
    expect(screen.getByTestId('board-piece-white-rook-a1')).toHaveAttribute(
      'data-piece-marker',
      'battlement',
    );
    expect(screen.getByTestId('board-piece-black-bishop-c8')).toHaveAttribute(
      'data-piece-marker',
      'spire',
    );
    expect(screen.getByTestId('board-piece-black-knight-g8')).toHaveAttribute(
      'data-piece-marker',
      'horse-head',
    );
    expect(screen.getByTestId('board-piece-black-pawn-e7')).toHaveAttribute(
      'data-piece-marker',
      'orb',
    );

    expect(screen.getByTestId('board-piece-white-king-e1')).toHaveAttribute(
      'data-piece-type',
      'king',
    );
    expect(screen.getByTestId('board-piece-black-knight-g8')).toHaveAttribute(
      'data-piece-color',
      'black',
    );
  });

  it('publishes a consistent grounded placement convention for every piece type', () => {
    const piecePlacements: ChessPiecePlacement[] = [
      { renderId: 'white-king-e1', square: 'e1', piece: 'king', color: 'white' },
      {
        renderId: 'white-queen-d1',
        square: 'd1',
        piece: 'queen',
        color: 'white',
      },
      { renderId: 'white-rook-a1', square: 'a1', piece: 'rook', color: 'white' },
      {
        renderId: 'white-bishop-c1',
        square: 'c1',
        piece: 'bishop',
        color: 'white',
      },
      {
        renderId: 'white-knight-b1',
        square: 'b1',
        piece: 'knight',
        color: 'white',
      },
      { renderId: 'white-pawn-e2', square: 'e2', piece: 'pawn', color: 'white' },
    ];

    render(
      <BoardScene
        CanvasBoundary={TestCanvasBoundary}
        legalDestinationSquares={[]}
        piecePlacements={piecePlacements}
        selectedSquare={null}
      />,
    );

    const renderedPieces = screen.getAllByTestId('board-piece');

    expect(renderedPieces).toHaveLength(6);

    renderedPieces.forEach((piece) => {
      expect(piece).toHaveAttribute(
        'data-grounding-convention',
        'local-origin-at-piece-base',
      );
      expect(piece).toHaveAttribute('data-local-base-y', '0');
      expect(piece).toHaveAttribute('data-board-surface-y', '0.09');
      expect(piece).toHaveAttribute('data-placement-y', '0.09');
    });
  });

  it('animates a normal piece move while keeping logical square state authoritative', () => {
    vi.useFakeTimers();

    try {
      const { rerender } = render(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-pawn-e2',
              square: 'e2',
              piece: 'pawn',
              color: 'white',
            },
          ]}
          selectedSquare={null}
        />,
      );

      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '0',
      );

      rerender(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-pawn-e4',
              square: 'e4',
              piece: 'pawn',
              color: 'white',
            },
          ]}
          selectedSquare={null}
        />,
      );

      expect(screen.getByTestId('board-square-e2')).toHaveAttribute(
        'data-piece',
        'empty',
      );
      expect(screen.getByTestId('board-square-e4')).toHaveAttribute(
        'data-piece',
        'white pawn',
      );
      expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
        'data-animation-state',
        'running',
      );
      expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
        'data-animation-from-square',
        'e2',
      );
      expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
        'data-animation-to-square',
        'e4',
      );
      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '1',
      );

      act(() => {
        vi.advanceTimersByTime(320);
      });

      expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
        'data-animation-state',
        'idle',
      );
      expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
        'data-placement-y',
        '0.09',
      );
      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '0',
      );
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('animates the moving piece during a capture while removing the captured piece immediately', () => {
    vi.useFakeTimers();

    try {
      const { rerender } = render(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-pawn-e4',
              square: 'e4',
              piece: 'pawn',
              color: 'white',
            },
            {
              renderId: 'black-pawn-d5',
              square: 'd5',
              piece: 'pawn',
              color: 'black',
            },
          ]}
          selectedSquare={null}
        />,
      );

      rerender(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-pawn-d5',
              square: 'd5',
              piece: 'pawn',
              color: 'white',
            },
          ]}
          selectedSquare={null}
        />,
      );

      expect(screen.getByTestId('board-square-e4')).toHaveAttribute(
        'data-piece',
        'empty',
      );
      expect(screen.getByTestId('board-square-d5')).toHaveAttribute(
        'data-piece',
        'white pawn',
      );
      expect(screen.queryByTestId('board-piece-black-pawn-d5')).not.toBeInTheDocument();
      expect(screen.getByTestId('board-piece-white-pawn-d5')).toHaveAttribute(
        'data-animation-state',
        'running',
      );
      expect(screen.getByTestId('board-piece-white-pawn-d5')).toHaveAttribute(
        'data-animation-from-square',
        'e4',
      );
      expect(screen.getByTestId('board-piece-white-pawn-d5')).toHaveAttribute(
        'data-animation-to-square',
        'd5',
      );
      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '1',
      );

      act(() => {
        vi.advanceTimersByTime(320);
      });

      expect(screen.getByTestId('board-piece-white-pawn-d5')).toHaveAttribute(
        'data-animation-state',
        'idle',
      );
      expect(screen.getByTestId('board-piece-white-pawn-d5')).toHaveAttribute(
        'data-placement-y',
        '0.09',
      );
      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '0',
      );
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('animates both king and rook during castling moves', () => {
    vi.useFakeTimers();

    try {
      const { rerender } = render(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-king-e1',
              square: 'e1',
              piece: 'king',
              color: 'white',
            },
            {
              renderId: 'white-rook-h1',
              square: 'h1',
              piece: 'rook',
              color: 'white',
            },
          ]}
          selectedSquare={null}
        />,
      );

      rerender(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-king-g1',
              square: 'g1',
              piece: 'king',
              color: 'white',
            },
            {
              renderId: 'white-rook-f1',
              square: 'f1',
              piece: 'rook',
              color: 'white',
            },
          ]}
          selectedSquare={null}
        />,
      );

      expect(screen.getByTestId('board-square-e1')).toHaveAttribute(
        'data-piece',
        'empty',
      );
      expect(screen.getByTestId('board-square-h1')).toHaveAttribute(
        'data-piece',
        'empty',
      );
      expect(screen.getByTestId('board-square-g1')).toHaveAttribute(
        'data-piece',
        'white king',
      );
      expect(screen.getByTestId('board-square-f1')).toHaveAttribute(
        'data-piece',
        'white rook',
      );
      expect(screen.getByTestId('board-piece-white-king-g1')).toHaveAttribute(
        'data-animation-state',
        'running',
      );
      expect(screen.getByTestId('board-piece-white-king-g1')).toHaveAttribute(
        'data-animation-from-square',
        'e1',
      );
      expect(screen.getByTestId('board-piece-white-king-g1')).toHaveAttribute(
        'data-animation-to-square',
        'g1',
      );
      expect(screen.getByTestId('board-piece-white-rook-f1')).toHaveAttribute(
        'data-animation-state',
        'running',
      );
      expect(screen.getByTestId('board-piece-white-rook-f1')).toHaveAttribute(
        'data-animation-from-square',
        'h1',
      );
      expect(screen.getByTestId('board-piece-white-rook-f1')).toHaveAttribute(
        'data-animation-to-square',
        'f1',
      );
      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '2',
      );

      act(() => {
        vi.advanceTimersByTime(320);
      });

      expect(screen.getByTestId('board-piece-white-king-g1')).toHaveAttribute(
        'data-animation-state',
        'idle',
      );
      expect(screen.getByTestId('board-piece-white-rook-f1')).toHaveAttribute(
        'data-animation-state',
        'idle',
      );
      expect(screen.getByTestId('board-piece-white-king-g1')).toHaveAttribute(
        'data-placement-y',
        '0.09',
      );
      expect(screen.getByTestId('board-piece-white-rook-f1')).toHaveAttribute(
        'data-placement-y',
        '0.09',
      );
      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '0',
      );
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('publishes running move-transition metadata in the committed move render', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = createRoot(container);

    try {
      flushSync(() => {
        root?.render(
          <BoardScene
            CanvasBoundary={TestCanvasBoundary}
            legalDestinationSquares={[]}
            piecePlacements={[
              {
                renderId: 'white-pawn-e2',
                square: 'e2',
                piece: 'pawn',
                color: 'white',
              },
            ]}
            selectedSquare={null}
          />,
        );
      });

      flushSync(() => {
        root?.render(
          <BoardScene
            CanvasBoundary={TestCanvasBoundary}
            legalDestinationSquares={[]}
            piecePlacements={[
              {
                renderId: 'white-pawn-e4',
                square: 'e4',
                piece: 'pawn',
                color: 'white',
              },
            ]}
            selectedSquare={null}
          />,
        );
      });

      expect(
        screen.getByTestId('board-piece-white-pawn-e4'),
      ).toHaveAttribute('data-animation-state', 'running');
      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '1',
      );
    } finally {
      root?.unmount();
      root = null;
      container.remove();
    }
  });

  it('tracks overlapping normal-move transitions for consecutive human and AI turns', () => {
    vi.useFakeTimers();

    try {
      const { rerender } = render(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-pawn-e2',
              square: 'e2',
              piece: 'pawn',
              color: 'white',
            },
            {
              renderId: 'black-pawn-e7',
              square: 'e7',
              piece: 'pawn',
              color: 'black',
            },
          ]}
          selectedSquare={null}
        />,
      );

      rerender(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-pawn-e4',
              square: 'e4',
              piece: 'pawn',
              color: 'white',
            },
            {
              renderId: 'black-pawn-e7',
              square: 'e7',
              piece: 'pawn',
              color: 'black',
            },
          ]}
          selectedSquare={null}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(120);
      });

      rerender(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-pawn-e4',
              square: 'e4',
              piece: 'pawn',
              color: 'white',
            },
            {
              renderId: 'black-pawn-e5',
              square: 'e5',
              piece: 'pawn',
              color: 'black',
            },
          ]}
          selectedSquare={null}
        />,
      );

      expect(screen.getByTestId('board-square-e2')).toHaveAttribute(
        'data-piece',
        'empty',
      );
      expect(screen.getByTestId('board-square-e4')).toHaveAttribute(
        'data-piece',
        'white pawn',
      );
      expect(screen.getByTestId('board-square-e7')).toHaveAttribute(
        'data-piece',
        'empty',
      );
      expect(screen.getByTestId('board-square-e5')).toHaveAttribute(
        'data-piece',
        'black pawn',
      );
      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '2',
      );
      expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
        'data-animation-state',
        'running',
      );
      expect(screen.getByTestId('board-piece-black-pawn-e5')).toHaveAttribute(
        'data-animation-state',
        'running',
      );
      expect(screen.getByTestId('board-piece-black-pawn-e5')).toHaveAttribute(
        'data-animation-from-square',
        'e7',
      );
      expect(screen.getByTestId('board-piece-black-pawn-e5')).toHaveAttribute(
        'data-animation-to-square',
        'e5',
      );

      act(() => {
        vi.advanceTimersByTime(320);
      });

      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '0',
      );
      expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
        'data-animation-state',
        'idle',
      );
      expect(screen.getByTestId('board-piece-black-pawn-e5')).toHaveAttribute(
        'data-animation-state',
        'idle',
      );
      expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
        'data-placement-y',
        '0.09',
      );
      expect(screen.getByTestId('board-piece-black-pawn-e5')).toHaveAttribute(
        'data-placement-y',
        '0.09',
      );
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('cancels in-flight piece transitions when the scene unmounts mid-move', () => {
    vi.useFakeTimers();

    const cancelAnimationFrameSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');

    try {
      const { rerender, unmount } = render(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-pawn-e2',
              square: 'e2',
              piece: 'pawn',
              color: 'white',
            },
          ]}
          selectedSquare={null}
        />,
      );

      rerender(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-pawn-e4',
              square: 'e4',
              piece: 'pawn',
              color: 'white',
            },
          ]}
          selectedSquare={null}
        />,
      );

      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '1',
      );

      unmount();

      act(() => {
        vi.runOnlyPendingTimers();
        vi.advanceTimersByTime(500);
      });

      expect(cancelAnimationFrameSpy).toHaveBeenCalled();
    } finally {
      cancelAnimationFrameSpy.mockRestore();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('skips piece move transitions when reduced motion is enabled', async () => {
    const originalMatchMedia = window.matchMedia;

    window.matchMedia = vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })) as typeof window.matchMedia;

    try {
      const { rerender } = render(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-pawn-e2',
              square: 'e2',
              piece: 'pawn',
              color: 'white',
            },
          ]}
          selectedSquare={null}
        />,
      );

      await waitFor(() =>
        expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
          'data-prefers-reduced-motion',
          'true',
        ),
      );

      rerender(
        <BoardScene
          CanvasBoundary={TestCanvasBoundary}
          legalDestinationSquares={[]}
          piecePlacements={[
            {
              renderId: 'white-pawn-e4',
              square: 'e4',
              piece: 'pawn',
              color: 'white',
            },
          ]}
          selectedSquare={null}
        />,
      );

      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-active-piece-animations',
        '0',
      );
      expect(screen.getByTestId('board-piece-animation-state')).toHaveAttribute(
        'data-animation-duration-ms',
        '0',
      );
      expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
        'data-animation-state',
        'idle',
      );
      expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
        'data-animation-from-square',
        'e4',
      );
      expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
        'data-animation-to-square',
        'e4',
      );
    } finally {
      window.matchMedia = originalMatchMedia;
    }
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

  it('publishes a readable move-highlight contract for empty and occupied legal destinations', () => {
    render(
      <BoardScene
        CanvasBoundary={TestCanvasBoundary}
        legalDestinationSquares={['e4', 'e7']}
        piecePlacements={[
          {
            renderId: 'white-pawn-e2',
            square: 'e2',
            piece: 'pawn',
            color: 'white',
          },
          {
            renderId: 'black-pawn-e7',
            square: 'e7',
            piece: 'pawn',
            color: 'black',
          },
        ]}
        selectedSquare="e2"
      />,
    );

    expect(screen.getByTestId('selected-square-highlight-e2')).toHaveAttribute(
      'data-highlight-palette',
      'green-gold',
    );
    expect(screen.getByTestId('selected-square-highlight-e2')).toHaveAttribute(
      'data-highlight-shape',
      'perimeter',
    );
    expect(screen.getByTestId('selected-square-highlight-e2')).toHaveAttribute(
      'data-highlight-treatment',
      'dual-ring',
    );
    expect(screen.getByTestId('selected-square-highlight-e2')).toHaveAttribute(
      'data-highlight-contrast',
      'light-dark-ready',
    );

    expect(screen.getByTestId('legal-destination-marker-e4')).toHaveAttribute(
      'data-marker-variant',
      'dot',
    );
    expect(screen.getByTestId('legal-destination-marker-e4')).toHaveAttribute(
      'data-occupied',
      'false',
    );
    expect(screen.getByTestId('legal-destination-marker-e4')).toHaveAttribute(
      'data-marker-treatment',
      'flat-dot',
    );
    expect(screen.getByTestId('legal-destination-marker-e7')).toHaveAttribute(
      'data-marker-variant',
      'perimeter',
    );
    expect(screen.getByTestId('legal-destination-marker-e7')).toHaveAttribute(
      'data-occupied',
      'true',
    );
    expect(screen.getByTestId('legal-destination-marker-e7')).toHaveAttribute(
      'data-marker-treatment',
      'capture-ring',
    );
    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-legal-marker-occupied-style',
      'perimeter',
    );
    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-legal-marker-treatment',
      'flat-dot',
    );
    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-selected-highlight-palette',
      'green-gold',
    );
    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-selected-highlight-treatment',
      'dual-ring',
    );
  });

  it('publishes the upgraded board visual contract for non-visual regression checks', () => {
    render(
      <BoardScene
        CanvasBoundary={TestCanvasBoundary}
        legalDestinationSquares={[]}
        selectedSquare={null}
      />,
    );

    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-frame-style',
      'walnut-bevel-frame',
    );
    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-light-square-material',
      'maple-readable-cap',
    );
    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-dark-square-material',
      'walnut-readable-cap',
    );
    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-square-surface-treatment',
      'single-cap-plane',
    );
    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-square-decoration-treatment',
      'recessed-accent',
    );
    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-square-decoration-inset',
      '0.016',
    );
    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-legal-marker-style',
      'glass-dot-marker',
    );
    expect(screen.getByTestId('board-visual-contract')).toHaveAttribute(
      'data-selected-marker-style',
      'brass-perimeter-highlight',
    );
  });

  it('publishes a deliberate lighting contract that preserves readable play', () => {
    render(
      <BoardScene
        CanvasBoundary={TestCanvasBoundary}
        legalDestinationSquares={[]}
        selectedSquare={null}
      />,
    );

    expect(screen.getByTestId('board-lighting-contract')).toHaveAttribute(
      'data-lighting-rig',
      'studio-warm-key',
    );
    expect(screen.getByTestId('board-lighting-contract')).toHaveAttribute(
      'data-shadow-style',
      'soft-readable',
    );
    expect(screen.getByTestId('board-lighting-contract')).toHaveAttribute(
      'data-key-light',
      'warm-front-right',
    );
    expect(screen.getByTestId('board-lighting-contract')).toHaveAttribute(
      'data-fill-light',
      'cool-left-fill',
    );
    expect(screen.getByTestId('board-lighting-contract')).toHaveAttribute(
      'data-rim-light',
      'cool-back-rim',
    );
    expect(screen.getByTestId('board-lighting-contract')).toHaveAttribute(
      'data-playability',
      'default-overhead-readable',
    );
  });
});
