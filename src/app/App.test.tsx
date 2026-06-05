import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import type { AsyncEngineAdapter, BestMoveResponse } from '../engine/engineTypes';
import { createGameStore } from '../game/gameStore';
import type { BoardSceneCanvasProps } from '../scene/BoardScene';
import { App } from './App';

function TestCanvasBoundary({ children }: BoardSceneCanvasProps) {
  return <div data-testid="board-scene-canvas">{children}</div>;
}

describe('App', () => {
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
    expect(
      screen.getByRole('region', { name: 'Board region' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Panel region' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('board-scene-canvas')).toBeInTheDocument();
    expect(screen.getByText('Status: In progress')).toBeInTheDocument();
    expect(screen.getByLabelText('AI difficulty')).toHaveValue('hard');
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
    expect(store.getState().legalDestinationSquares).toEqual(
      expect.arrayContaining(['e3', 'e4']),
    );
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
});

function createFakeEngine(): AsyncEngineAdapter & {
  requestBestMove: ReturnType<typeof vi.fn>;
} {
  const requestBestMove = vi.fn<
    (request: { fen: string }) => Promise<BestMoveResponse>
  >();

  return {
    state: 'ready',
    async setDifficulty() {},
    requestBestMove,
    async cancelSearch() {},
    async dispose() {},
  };
}
