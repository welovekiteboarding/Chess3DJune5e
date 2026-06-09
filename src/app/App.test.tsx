import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';

import type { AsyncEngineAdapter, BestMoveResponse } from '../engine/engineTypes';
import { createGameStore } from '../game/gameStore';
import type { BoardSceneCanvasProps } from '../scene/BoardScene';
import { App } from './App';

function TestCanvasBoundary({ children }: BoardSceneCanvasProps) {
  return <div data-testid="board-scene-canvas">{children}</div>;
}

describe('App', () => {
  const promotionReadyFen = '7k/4P3/8/8/8/8/8/4K3 w - - 0 1';
  const checkFen = '4Q1k1/8/8/8/8/8/8/K7 b - - 0 1';
  const checkmateFen = '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1';
  const stalemateFen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
  const drawFen = '8/8/8/8/8/8/2k5/3K4 w - - 0 1';
  const promotionFenByPiece = {
    queen: '4Q2k/8/8/8/8/8/8/4K3 b - - 0 1',
    rook: '4R2k/8/8/8/8/8/8/4K3 b - - 0 1',
    bishop: '4B2k/8/8/8/8/8/8/4K3 b - - 0 1',
    knight: '4N2k/8/8/8/8/8/8/4K3 b - - 0 1',
  } as const;

  it('composes the local chess shell from the game store state', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
      aiDifficulty: 'hard',
    });

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '3D Chess',
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-title')).toHaveTextContent('3D Chess');
    expect(
      screen.getByRole('region', { name: 'Board region' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Panel region' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('board-scene-canvas')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Move history',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Game controls',
      }),
    ).toBeInTheDocument();
    const liveOverview = screen.getByLabelText('Live game overview');

    expect(within(liveOverview).getByText('Status')).toBeInTheDocument();
    expect(within(liveOverview).getByText('Ongoing')).toBeInTheDocument();
    expect(within(liveOverview).getByText('Turn')).toBeInTheDocument();
    expect(within(liveOverview).getByText('White to move')).toBeInTheDocument();
    expect(within(liveOverview).getByText('Engine')).toBeInTheDocument();
    expect(within(liveOverview).getByText('Idle')).toBeInTheDocument();
    expect(screen.queryByText('Command deck')).not.toBeInTheDocument();
    expect(screen.queryByText('Telemetry + controls')).not.toBeInTheDocument();
    expect(screen.queryByText('Engine standing by')).not.toBeInTheDocument();
    expect(screen.queryByText('Operational console')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Match status' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Stockfish' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Status: Ongoing')).not.toBeInTheDocument();
    expect(screen.queryByText('Engine idle')).not.toBeInTheDocument();
    expect(screen.queryByText('Engine thinking')).not.toBeInTheDocument();
    expect(screen.getByLabelText('AI difficulty')).toHaveValue('hard');
    expect(
      screen.getByRole('toolbar', { name: 'Board camera controls' }),
    ).toBeVisible();
  });

  it('wires board square selection into the game store', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));

    expect(store.getState().selectedSquare).toBe('e2');
    expect(store.getState().legalDestinationSquares).toEqual(['e3', 'e4']);
    expect(screen.getByTestId('legal-destination-square-e3')).toHaveAttribute(
      'data-square',
      'e3',
    );
    expect(screen.getByTestId('legal-destination-square-e4')).toHaveAttribute(
      'data-square',
      'e4',
    );
    expect(screen.queryByTestId('legal-destination-square-e5')).not.toBeInTheDocument();
  });

  it('keeps visible-board move interaction working after camera controls are used', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Overhead view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));

    expect(screen.getByTestId('board-camera-state')).toHaveAttribute(
      'data-view-mode',
      'default',
    );

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));
    fireEvent.click(screen.getByRole('button', { name: 'e4 square' }));

    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);
    expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
      'data-square',
      'e4',
    );
    expect(screen.queryByTestId('board-piece-white-pawn-e2')).not.toBeInTheDocument();
  });

  it('allows the browser regression harness to seed long move history through app state', async () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });
    const originalUrl = window.location.href;
    const fixtureMoves = Array.from(
      { length: 80 },
      (_, index) => `${index + 1}. human e2e4`,
    );

    window.history.pushState({}, '', `${window.location.pathname}?e2e-fixture=1`);

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    const appWindow = window as Window & {
      __CHESS3D_E2E__?: {
        loadPositionFixture: (fen: string) => void;
        setMoveHistoryFixture: (moves: readonly string[]) => void;
      };
    };

    appWindow.__CHESS3D_E2E__?.setMoveHistoryFixture(fixtureMoves);

    await waitFor(() =>
      expect(screen.getAllByTestId('move-history-item')).toHaveLength(80),
    );

    expect(screen.getAllByTestId('move-history-item')[0]).toHaveTextContent(
      '1. human e2e4',
    );
    expect(screen.getByTestId('move-history-scroll')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New game' })).toBeVisible();
    expect(screen.getByLabelText('AI difficulty')).toBeVisible();

    window.history.pushState({}, '', originalUrl);
  });

  it('allows the browser regression harness to seed a promotion-ready position through app state', async () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });
    const originalUrl = window.location.href;

    window.history.pushState({}, '', `${window.location.pathname}?e2e-fixture=1`);

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    const appWindow = window as Window & {
      __CHESS3D_E2E__?: {
        loadPositionFixture: (fen: string) => void;
        setMoveHistoryFixture: (moves: readonly string[]) => void;
      };
    };

    appWindow.__CHESS3D_E2E__?.loadPositionFixture(promotionReadyFen);

    await waitFor(() =>
      expect(screen.getByTestId('board-piece-white-pawn-e7')).toHaveAttribute(
        'data-square',
        'e7',
      ),
    );

    expect(store.getState().currentFen).toBe(promotionReadyFen);
    expect(store.getState().moveHistory).toEqual([]);
    expect(store.getState().pendingPromotion).toBeNull();
    expect(screen.getByRole('button', { name: 'e7 square' })).toHaveAttribute(
      'data-piece',
      'white pawn',
    );
    expect(screen.queryByTestId('board-piece-white-pawn-e2')).not.toBeInTheDocument();

    window.history.pushState({}, '', originalUrl);
  });

  it('applies a legal human click-to-move sequence without triggering an AI request', () => {
    const engine = createFakeEngine();
    const store = createGameStore({
      engine,
    });
    const startingFen = store.getState().currentFen;

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));
    fireEvent.click(screen.getByRole('button', { name: 'e4 square' }));

    expect(store.getState().currentFen).not.toBe(startingFen);
    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);
    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
    expect(screen.getByTestId('board-piece-white-pawn-e4')).toHaveAttribute(
      'data-square',
      'e4',
    );
    expect(screen.queryByTestId('board-piece-white-pawn-e2')).not.toBeInTheDocument();
    const liveOverview = screen.getByLabelText('Live game overview');

    expect(within(liveOverview).getByText('Ongoing')).toBeInTheDocument();
    expect(within(liveOverview).getByText('Black to move')).toBeInTheDocument();
    expect(engine.requestBestMove).not.toHaveBeenCalled();
  });

  it('leaves game state unchanged for an illegal human click-to-move destination', () => {
    const engine = createFakeEngine();
    const store = createGameStore({
      engine,
    });
    const startingFen = store.getState().currentFen;

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));
    fireEvent.click(screen.getByRole('button', { name: 'e5 square' }));

    expect(store.getState().currentFen).toBe(startingFen);
    expect(store.getState().moveHistory).toEqual([]);
    expect(screen.getByTestId('board-piece-white-pawn-e2')).toHaveAttribute(
      'data-square',
      'e2',
    );
    expect(screen.queryByTestId('board-piece-white-pawn-e4')).not.toBeInTheDocument();
    expect(engine.requestBestMove).not.toHaveBeenCalled();
  });

  it('clears legal-destination markers when the selected square is clicked again', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));

    expect(screen.getByTestId('legal-destination-square-e3')).toBeInTheDocument();
    expect(screen.getByTestId('legal-destination-square-e4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));

    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
    expect(store.getState().moveHistory).toEqual([]);
    expect(screen.queryByTestId('legal-destination-square-e3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('legal-destination-square-e4')).not.toBeInTheDocument();
  });

  it('requires confirmation before resetting an in-progress game and preserves the selected difficulty after reset', async () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    await store.getState().setAiDifficulty('hard');

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));
    fireEvent.click(screen.getByRole('button', { name: 'e4 square' }));

    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'New game' }));

    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);
    expect(
      screen.getByRole('button', { name: 'Confirm new game' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Start over? Current progress will be lost.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm new game' }));

    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
    expect(store.getState().moveHistory).toEqual([]);
    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
    expect(store.getState().aiDifficulty).toBe('hard');
    expect(screen.getByLabelText('AI difficulty')).toHaveValue('hard');
    expect(screen.getByText('No moves yet.')).toBeInTheDocument();
    expect(screen.getByTestId('board-piece-white-pawn-e2')).toHaveAttribute(
      'data-square',
      'e2',
    );
    expect(screen.queryByTestId('board-piece-white-pawn-e4')).not.toBeInTheDocument();
  });

  it('does not retry AI requests in a loop after an engine failure', async () => {
    const engine = createFakeEngine();
    engine.requestBestMove.mockRejectedValue(new Error('Engine offline'));

    const store = createGameStore({
      engine,
    });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');

    render(
      <App
        autoRequestAiMoves
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Latest error: Engine offline',
      ),
    );

    await waitFor(() => {
      expect(engine.requestBestMove).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the latest engine failure through the panel alert region', async () => {
    const engine = createFakeEngine();
    engine.requestBestMove.mockRejectedValue(new Error('Engine offline'));

    const store = createGameStore({
      engine,
    });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');

    render(
      <App
        autoRequestAiMoves
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('alert', { name: 'Engine error' }),
      ).toHaveTextContent('Latest error: Engine offline'),
    );
  });

  it('auto-requests the opening AI move by default when the human plays black', async () => {
    const engine = createFakeEngine();
    engine.requestBestMove.mockResolvedValue({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      move: 'e2e4',
    });

    const store = createGameStore({
      engine,
      humanSide: 'black',
    });

    render(
      <App
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    await waitFor(() =>
      expect(engine.requestBestMove).toHaveBeenCalledWith({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      }),
    );
  });

  it('auto-requests the opening AI move only once in strict mode when the human plays black', async () => {
    const engine = createFakeEngine();
    const deferredResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove.mockReturnValue(deferredResponse.promise);

    const store = createGameStore({
      engine,
      humanSide: 'black',
    });

    render(
      <StrictMode>
        <App
          boardSceneCanvasBoundary={TestCanvasBoundary}
          store={store}
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(engine.requestBestMove).toHaveBeenCalledTimes(1);
    });

    deferredResponse.resolve({
      difficulty: 'medium',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      move: 'e2e4',
    });

    await waitFor(() =>
      expect(store.getState().moveHistory).toEqual([
        {
          player: 'ai',
          uci: 'e2e4',
        },
      ]),
    );
  });

  it('automatically applies one AI response after a legal human move', async () => {
    const engine = createFakeEngine();
    engine.requestBestMove.mockResolvedValue({
      difficulty: 'medium',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      move: 'e7e5',
    });

    const store = createGameStore({
      engine,
    });

    render(
      <App
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));
    fireEvent.click(screen.getByRole('button', { name: 'e4 square' }));

    await waitFor(() => {
      expect(engine.requestBestMove).toHaveBeenCalledTimes(1);
    });

    await waitFor(() =>
      expect(store.getState().moveHistory).toEqual([
        {
          player: 'human',
          uci: 'e2e4',
        },
        {
          player: 'ai',
          uci: 'e7e5',
        },
      ]),
    );

    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    );
    expect(screen.getByTestId('board-piece-black-pawn-e5')).toHaveAttribute(
      'data-square',
      'e5',
    );
    expect(screen.getByText('2. ai e7e5')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Live game overview')).getByText('White to move'),
    ).toBeInTheDocument();
  });

  it('ignores a duplicate visible-board destination click after the legal human move already succeeded', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));
    fireEvent.click(screen.getByRole('button', { name: 'e4 square' }));
    fireEvent.click(screen.getByRole('button', { name: 'e4 square' }));

    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);
    expect(store.getState().latestError).toBeNull();
    expect(store.getState().latestErrorKind).toBeNull();
  });

  it('clears a stale input error and auto-requests the first AI reply after a visible-board move', async () => {
    const engine = createFakeEngine();
    engine.requestBestMove.mockResolvedValue({
      difficulty: 'medium',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      move: 'e7e5',
    });

    const store = createGameStore({
      engine,
    });

    store.setState({
      latestError: 'No square selected.',
      latestErrorKind: 'input',
    });

    render(
      <App
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    expect(
      screen.getByRole('alert', { name: 'Engine error' }),
    ).toHaveTextContent('Latest error: No square selected.');

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));
    fireEvent.click(screen.getByRole('button', { name: 'e4 square' }));

    await waitFor(() => {
      expect(engine.requestBestMove).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('1. human e2e4')).toBeInTheDocument();

    await waitFor(() =>
      expect(store.getState().moveHistory).toEqual([
        {
          player: 'human',
          uci: 'e2e4',
        },
        {
          player: 'ai',
          uci: 'e7e5',
        },
      ]),
    );

    expect(store.getState().latestError).toBeNull();
    expect(store.getState().latestErrorKind).toBeNull();
  });

  it('shows engine thinking during auto-play and clears the status after the AI move resolves', async () => {
    const engine = createFakeEngine();
    const deferredResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove.mockReturnValue(deferredResponse.promise);

    const store = createGameStore({
      engine,
    });

    render(
      <App
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));
    fireEvent.click(screen.getByRole('button', { name: 'e4 square' }));

    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Live game overview')).getByText('Thinking'),
      ).toBeInTheDocument(),
    );

    deferredResponse.resolve({
      difficulty: 'medium',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      move: 'e7e5',
    });

    await waitFor(() =>
      expect(store.getState().moveHistory).toEqual([
        {
          player: 'human',
          uci: 'e2e4',
        },
        {
          player: 'ai',
          uci: 'e7e5',
        },
      ]),
    );

    expect(
      within(screen.getByLabelText('Live game overview')).getByText('Idle'),
    ).toBeInTheDocument();
  });

  it('locks visible-board human input while Stockfish is thinking and keeps New game available', async () => {
    const engine = createFakeEngine();
    const deferredResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove.mockReturnValue(deferredResponse.promise);

    const store = createGameStore({
      engine,
    });

    render(
      <App
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));
    fireEvent.click(screen.getByRole('button', { name: 'e4 square' }));

    await waitFor(() =>
      expect(screen.getByTestId('game-panel-thinking-indicator')).toHaveTextContent(
        'Stockfish is thinking...',
      ),
    );

    expect(screen.getByRole('button', { name: 'g1 square' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Retry AI move' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancel AI move' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New game' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'g1 square' }));

    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'New game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new game' }));

    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
    expect(store.getState().isEngineThinking).toBe(false);
    expect(store.getState().moveHistory).toEqual([]);
    expect(engine.cancelSearch).toHaveBeenCalledTimes(1);
  });

  it('shows a cancel control during auto-play, then exposes a retry path after cancellation', async () => {
    const engine = createFakeEngine();
    const firstResponse = createDeferred<BestMoveResponse>();
    const secondResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);

    const store = createGameStore({
      engine,
    });

    render(
      <App
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'e2 square' }));
    fireEvent.click(screen.getByRole('button', { name: 'e4 square' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Cancel AI move' }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel AI move' }));

    expect(engine.cancelSearch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Cancel AI move' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('alert', { name: 'Engine error' }),
    ).toHaveTextContent('Latest error: AI move was cancelled. Retry AI move to continue.');
    expect(
      screen.getByRole('button', { name: 'Retry AI move' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry AI move' }));

    await waitFor(() => {
      expect(engine.requestBestMove).toHaveBeenCalledTimes(2);
    });

    firstResponse.resolve({
      difficulty: 'medium',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      move: 'e7e5',
    });

    await waitFor(() =>
      expect(store.getState().moveHistory).toEqual([
        {
          player: 'human',
          uci: 'e2e4',
        },
      ]),
    );

    secondResponse.resolve({
      difficulty: 'medium',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      move: 'e7e5',
    });

    await waitFor(() =>
      expect(store.getState().moveHistory).toEqual([
        {
          player: 'human',
          uci: 'e2e4',
        },
        {
          player: 'ai',
          uci: 'e7e5',
        },
      ]),
    );

    expect(
      within(screen.getByLabelText('Live game overview')).getByText('Idle'),
    ).toBeInTheDocument();
  });

  it('keeps the difficulty control wired to the store and engine adapter', async () => {
    const engine = createFakeEngine();
    const store = createGameStore({
      engine,
    });

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.change(screen.getByLabelText('AI difficulty'), {
      target: { value: 'hard' },
    });

    await waitFor(() => {
      expect(engine.setDifficulty).toHaveBeenCalledWith('hard');
    });

    expect(store.getState().aiDifficulty).toBe('hard');
    expect(screen.getByLabelText('AI difficulty')).toHaveValue('hard');
  });

  it('shows the promotion UI when the store has a pending promotion', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
      initialFen: promotionReadyFen,
    });

    store.getState().selectSquare('e7');
    store.getState().attemptHumanMove('e8');

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: 'Choose promotion piece' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Promote to queen' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancel promotion' }),
    ).toBeInTheDocument();
  });

  it('renders checkmate status from store-backed chess state without requesting an AI move', () => {
    const engine = createFakeEngine();
    const store = createGameStore({
      engine,
      initialFen: checkmateFen,
    });

    render(
      <App
        autoRequestAiMoves
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    const liveOverview = screen.getByLabelText('Live game overview');

    expect(within(liveOverview).getByText('Checkmate')).toBeInTheDocument();
    expect(within(liveOverview).getByText('Game over')).toBeInTheDocument();
    expect(screen.getByTestId('game-panel-chess-alert')).toHaveTextContent(
      'Checkmate',
    );
    expect(screen.getByTestId('game-panel-game-over')).toHaveTextContent(
      'Checkmate',
    );
    expect(engine.requestBestMove).not.toHaveBeenCalled();
  });

  it('renders check status from store-backed chess state while keeping the move prompt visible', () => {
    const engine = createFakeEngine();
    const store = createGameStore({
      engine,
      initialFen: checkFen,
    });

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    const liveOverview = screen.getByLabelText('Live game overview');

    expect(within(liveOverview).getByText('Check')).toBeInTheDocument();
    expect(within(liveOverview).getByText('Black to move')).toBeInTheDocument();
    expect(screen.getByTestId('game-panel-chess-alert')).toHaveTextContent('Check');
    expect(screen.queryByTestId('game-panel-game-over')).not.toBeInTheDocument();
    expect(engine.requestBestMove).not.toHaveBeenCalled();
  });

  it.each([
    {
      fen: checkmateFen,
      status: 'Checkmate',
    },
    {
      fen: stalemateFen,
      status: 'Stalemate',
    },
    {
      fen: drawFen,
      status: 'Draw',
    },
  ])(
    'renders a store-backed game-over panel for $status without a normal move prompt',
    ({ fen, status }) => {
      const engine = createFakeEngine();
      const store = createGameStore({
        engine,
        initialFen: fen,
      });

      render(
        <App
          autoRequestAiMoves
          boardSceneCanvasBoundary={TestCanvasBoundary}
          store={store}
        />,
      );

      const liveOverview = screen.getByLabelText('Live game overview');

      expect(within(liveOverview).getByText(status)).toBeInTheDocument();
      expect(within(liveOverview).getByText('Game over')).toBeInTheDocument();
      expect(within(liveOverview).queryByText(/to move$/)).not.toBeInTheDocument();
      expect(screen.getByTestId('game-panel-chess-alert')).toHaveTextContent(status);
      expect(screen.getByTestId('game-panel-game-over')).toHaveTextContent(status);
      expect(
        screen.getByRole('button', { name: 'New game' }),
      ).toBeVisible();
      expect(screen.getByText('Game complete')).toBeInTheDocument();
      expect(screen.queryByText('Engine ready')).not.toBeInTheDocument();
      expect(engine.requestBestMove).not.toHaveBeenCalled();
    },
  );

  it('does not allow drawn game positions to surface move-selection prompts on the board', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
      initialFen: drawFen,
    });

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'd1 square' }));

    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
    expect(
      screen.queryByTestId('selected-square-highlight-d1'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('legal-destination-square-e1'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('game-panel-game-over')).toHaveTextContent('Draw');
  });

  it.each([
    ['queen', 'q'],
    ['rook', 'r'],
    ['bishop', 'b'],
    ['knight', 'n'],
  ] as const)(
    'completes a pending promotion when the user chooses %s',
    (promotion, promotionCode) => {
      const store = createGameStore({
        engine: createFakeEngine(),
        initialFen: promotionReadyFen,
      });

      store.getState().selectSquare('e7');
      store.getState().attemptHumanMove('e8');

      render(
        <App
          autoRequestAiMoves={false}
          boardSceneCanvasBoundary={TestCanvasBoundary}
          store={store}
        />,
      );

      fireEvent.click(
        screen.getByRole('button', { name: `Promote to ${promotion}` }),
      );

      expect(store.getState().pendingPromotion).toBeNull();
      expect(store.getState().currentFen).toBe(promotionFenByPiece[promotion]);
      expect(store.getState().moveHistory).toEqual([
        {
          player: 'human',
          uci: `e7e8${promotionCode}`,
        },
      ]);
      expect(
        screen.queryByRole('dialog', { name: 'Choose promotion piece' }),
      ).not.toBeInTheDocument();
    },
  );

  it('clears pending promotion when the user cancels the promotion flow', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
      initialFen: promotionReadyFen,
    });

    store.getState().selectSquare('e7');
    store.getState().attemptHumanMove('e8');

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel promotion' }));

    expect(store.getState().pendingPromotion).toBeNull();
    expect(store.getState().currentFen).toBe(promotionReadyFen);
    expect(store.getState().moveHistory).toEqual([]);
    expect(
      screen.queryByRole('dialog', { name: 'Choose promotion piece' }),
    ).not.toBeInTheDocument();
  });

  it('resets a custom-position session back to the standard starting board through the New game flow', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
      initialFen: promotionReadyFen,
    });

    store.getState().selectSquare('e7');
    store.getState().attemptHumanMove('e8');

    render(
      <App
        autoRequestAiMoves={false}
        boardSceneCanvasBoundary={TestCanvasBoundary}
        store={store}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: 'Choose promotion piece' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new game' }));

    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
    expect(store.getState().pendingPromotion).toBeNull();
    expect(store.getState().moveHistory).toEqual([]);
    expect(
      screen.queryByRole('dialog', { name: 'Choose promotion piece' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('board-piece-white-pawn-e2')).toHaveAttribute(
      'data-square',
      'e2',
    );
    expect(screen.queryByTestId('board-piece-white-queen-e8')).not.toBeInTheDocument();
  });
});

function createFakeEngine(): AsyncEngineAdapter & {
  cancelSearch: ReturnType<typeof vi.fn>;
  setDifficulty: ReturnType<typeof vi.fn>;
  requestBestMove: ReturnType<typeof vi.fn>;
} {
  const cancelSearch = vi.fn(async () => {});
  const setDifficulty = vi.fn(async () => {});
  const requestBestMove = vi.fn<
    (request: { fen: string }) => Promise<BestMoveResponse>
  >();

  return {
    state: 'ready',
    setDifficulty,
    requestBestMove,
    cancelSearch,
    async dispose() {},
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}
