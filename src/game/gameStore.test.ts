import type { AsyncEngineAdapter } from '../engine/engineTypes';
import { createGameStore } from './gameStore';

describe('gameStore', () => {
  it('initializes a local human-vs-AI game from the starting position', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
    expect(store.getState().moveHistory).toEqual([]);
    expect(store.getState().gameStatus).toEqual({
      kind: 'ongoing',
    });
    expect(store.getState().humanSide).toBe('white');
    expect(store.getState().aiSide).toBe('black');
    expect(store.getState().aiDifficulty).toBe('medium');
    expect(store.getState().isEngineThinking).toBe(false);
    expect(store.getState().latestError).toBeNull();
  });

  it('selects a legal human piece and exposes its legal destinations', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    store.getState().selectSquare('e2');

    expect(store.getState().selectedSquare).toBe('e2');
    expect(store.getState().legalDestinationSquares).toEqual(
      expect.arrayContaining(['e3', 'e4']),
    );
  });

  it('applies e2e4 as a human move', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    store.getState().selectSquare('e2');
    const result = store.getState().attemptHumanMove('e4');

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error('Expected human move to succeed.');
    }

    expect(result.move.uci).toBe('e2e4');
    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    );
    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);
  });

  it('rejects an illegal human move without changing the position', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });
    const startingFen = store.getState().currentFen;

    store.getState().selectSquare('e2');
    const result = store.getState().attemptHumanMove('e5');

    expect(result).toEqual({
      ok: false,
      error: 'Illegal move: e2e5',
    });
    expect(store.getState().currentFen).toBe(startingFen);
    expect(store.getState().moveHistory).toEqual([]);
    expect(store.getState().latestError).toBe('Illegal move: e2e5');
  });

  it('applies a valid fake AI move through the same chess validation boundary', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');

    const result = store.getState().applyAiMove('e7e5');

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error('Expected AI move to succeed.');
    }

    expect(result.move.uci).toBe('e7e5');
    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    );
    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
      {
        player: 'ai',
        uci: 'e7e5',
      },
    ]);
  });

  it('rejects an invalid fake AI move and records an error', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');
    const fenAfterHumanMove = store.getState().currentFen;

    const result = store.getState().applyAiMove('e7e4');

    expect(result).toEqual({
      ok: false,
      error: 'Illegal move: e7e4',
    });
    expect(store.getState().currentFen).toBe(fenAfterHumanMove);
    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);
    expect(store.getState().latestError).toBe('Illegal move: e7e4');
  });

  it('starts a new game from the initial position and clears transient state', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e5');
    store.getState().startNewGame();

    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
    expect(store.getState().moveHistory).toEqual([]);
    expect(store.getState().gameStatus).toEqual({
      kind: 'ongoing',
    });
    expect(store.getState().isEngineThinking).toBe(false);
    expect(store.getState().latestError).toBeNull();
  });
});

function createFakeEngine(): AsyncEngineAdapter {
  return {
    state: 'ready',
    async setDifficulty() {},
    async requestBestMove() {
      return {
        move: 'e2e4',
        difficulty: 'medium',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      };
    },
    async cancelSearch() {},
    async dispose() {},
  };
}
