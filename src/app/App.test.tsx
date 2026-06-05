import { render, screen } from '@testing-library/react';
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
