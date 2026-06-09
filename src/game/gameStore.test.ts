import { vi } from 'vitest';

import type { AsyncEngineAdapter, BestMoveResponse } from '../engine/engineTypes';
import { getPiecePlacementsFromFen } from '../chess/chessRules';
import { createGameStore } from './gameStore';

describe('gameStore', () => {
  const promotionReadyFen = '7k/4P3/8/8/8/8/8/4K3 w - - 0 1';
  const aiPromotionReadyFen = '7K/8/8/8/8/8/4p3/k7 b - - 0 1';
  const checkFen = '4Q1k1/8/8/8/8/8/8/K7 b - - 0 1';
  const stalemateFen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
  const drawFen = '8/8/8/8/8/8/2k5/3K4 w - - 0 1';
  const promotionFenByPiece = {
    queen: '4Q2k/8/8/8/8/8/8/4K3 b - - 0 1',
    rook: '4R2k/8/8/8/8/8/8/4K3 b - - 0 1',
    bishop: '4B2k/8/8/8/8/8/8/4K3 b - - 0 1',
    knight: '4N2k/8/8/8/8/8/8/4K3 b - - 0 1',
  } as const;

  it('initializes a local human-vs-AI game from the starting position', () => {
    const engine = createFakeEngine();
    const store = createGameStore({ engine });

    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
    expect(store.getState().moveHistory).toEqual([]);
    expect(store.getState().gameStatus).toEqual({
      kind: 'ongoing',
    });
    expect(store.getState().gameStatusLabel).toBe('Ongoing');
    expect(store.getState().humanSide).toBe('white');
    expect(store.getState().aiSide).toBe('black');
    expect(store.getState().sideToMove).toBe('white');
    expect(store.getState().sideToMoveLabel).toBe('White to move');
    expect(store.getState().aiDifficulty).toBe('medium');
    expect(store.getState().boardResetRevision).toBe(0);
    expect(store.getState().isEngineThinking).toBe(false);
    expect(store.getState().latestError).toBeNull();
    expect(engine.requestBestMove).not.toHaveBeenCalled();
  });

  it('selects a legal human piece and exposes its legal destinations', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    store.getState().selectSquare('e2');

    expect(store.getState().selectedSquare).toBe('e2');
    expect(store.getState().legalDestinationSquares).toEqual(['e3', 'e4']);
    expect(store.getState().legalDestinationSquares).not.toContain('e5');
  });

  it('clears the selected square and legal destinations without applying a move', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    store.getState().selectSquare('e2');
    store.getState().clearSelection();

    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
    expect(store.getState().moveHistory).toEqual([]);
  });

  it('does not select an opponent piece when it is not that side to move', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    store.getState().selectSquare('e7');

    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
  });

  it('does not select an empty square when there is no active selection', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    store.getState().selectSquare('e4');

    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
  });

  it('replaces the selected square when another legal human piece is selected', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    store.getState().selectSquare('e2');
    store.getState().selectSquare('g1');

    expect(store.getState().selectedSquare).toBe('g1');
    expect(store.getState().legalDestinationSquares).toEqual(
      expect.arrayContaining(['f3', 'h3']),
    );
  });

  it('applies e2e4 successfully without auto-requesting an engine move', () => {
    const engine = createFakeEngine();
    const store = createGameStore({ engine });

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
    expect(store.getState().gameStatus).toEqual({
      kind: 'ongoing',
    });
    expect(store.getState().gameStatusLabel).toBe('Ongoing');
    expect(store.getState().sideToMove).toBe('black');
    expect(store.getState().sideToMoveLabel).toBe('Black to move');
    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
    expect(getPiecePlacementsFromFen(store.getState().currentFen)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          square: 'e4',
          piece: 'pawn',
          color: 'white',
        }),
      ]),
    );
    expect(store.getState().latestError).toBeNull();
    expect(engine.requestBestMove).not.toHaveBeenCalled();
  });

  it('clears a transient input error after a later legal human move succeeds', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
    });

    expect(store.getState().attemptHumanMove('e4')).toEqual({
      ok: false,
      error: 'No square selected.',
    });
    expect(store.getState().latestError).toBe('No square selected.');
    expect(store.getState().latestErrorKind).toBe('input');

    store.getState().selectSquare('e2');
    const result = store.getState().attemptHumanMove('e4');

    expect(result).toEqual({
      ok: true,
      move: {
        from: 'e2',
        to: 'e4',
        uci: 'e2e4',
      },
    });
    expect(store.getState().latestError).toBeNull();
    expect(store.getState().latestErrorKind).toBeNull();
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

  it('enters pending promotion state instead of applying an incomplete human promotion move', () => {
    const engine = createFakeEngine();
    const store = createGameStore({
      engine,
      initialFen: promotionReadyFen,
    });

    store.getState().selectSquare('e7');
    const result = store.getState().attemptHumanMove('e8');

    expect(result).toEqual({
      ok: false,
      error: 'Human promotion piece selection is required.',
    });
    expect(store.getState().currentFen).toBe(promotionReadyFen);
    expect(store.getState().moveHistory).toEqual([]);
    expect(store.getState().pendingPromotion).toEqual({
      from: 'e7',
      to: 'e8',
      choices: ['queen', 'rook', 'bishop', 'knight'],
    });
    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
    expect(engine.requestBestMove).not.toHaveBeenCalled();
  });

  it.each([
    ['queen', 'q'],
    ['rook', 'r'],
    ['bishop', 'b'],
    ['knight', 'n'],
  ] as const)(
    'completes a pending promotion with %s and clears pending promotion state',
    (promotion, promotionCode) => {
      const engine = createFakeEngine();
      const store = createGameStore({
        engine,
        initialFen: promotionReadyFen,
      });

      store.getState().selectSquare('e7');
      store.getState().attemptHumanMove('e8');

      const result = store.getState().completePendingPromotion(promotion);

      expect(result).toEqual({
        ok: true,
        move: {
          from: 'e7',
          to: 'e8',
          promotion,
          uci: `e7e8${promotionCode}`,
        },
      });
      expect(store.getState().currentFen).toBe(promotionFenByPiece[promotion]);
      expect(store.getState().moveHistory).toEqual([
        {
          player: 'human',
          uci: `e7e8${promotionCode}`,
        },
      ]);
      expect(store.getState().pendingPromotion).toBeNull();
      expect(store.getState().latestError).toBeNull();
      expect(engine.requestBestMove).not.toHaveBeenCalled();
    },
  );

  it('cancels a pending promotion without changing the position', () => {
    const engine = createFakeEngine();
    const store = createGameStore({
      engine,
      initialFen: promotionReadyFen,
    });

    store.getState().selectSquare('e7');
    store.getState().attemptHumanMove('e8');
    store.getState().cancelPendingPromotion();

    expect(store.getState().currentFen).toBe(promotionReadyFen);
    expect(store.getState().moveHistory).toEqual([]);
    expect(store.getState().pendingPromotion).toBeNull();
    expect(store.getState().latestError).toBeNull();
    expect(engine.requestBestMove).not.toHaveBeenCalled();
  });

  it('clears a pending promotion when starting a new game', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
      initialFen: promotionReadyFen,
    });

    store.getState().selectSquare('e7');
    store.getState().attemptHumanMove('e8');
    store.getState().startNewGame();

    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
    expect(store.getState().pendingPromotion).toBeNull();
    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
    expect(store.getState().moveHistory).toEqual([]);
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
    expect(store.getState().latestError).toBeNull();
  });

  it('applies an AI promotion move returned from Stockfish through the chess validation boundary', async () => {
    const engine = createFakeEngine();
    engine.requestBestMove.mockResolvedValue({
      difficulty: 'medium',
      fen: aiPromotionReadyFen,
      move: 'e2e1n',
    });
    const store = createGameStore({
      engine,
      initialFen: aiPromotionReadyFen,
    });

    const result = await store.getState().requestAiMove();

    expect(result).toEqual({
      ok: true,
      move: {
        from: 'e2',
        to: 'e1',
        promotion: 'knight',
        uci: 'e2e1n',
      },
    });
    expect(store.getState().moveHistory).toEqual([
      {
        player: 'ai',
        uci: 'e2e1n',
      },
    ]);
    expect(store.getState().pendingPromotion).toBeNull();
    expect(store.getState().latestError).toBeNull();
    expect(getPiecePlacementsFromFen(store.getState().currentFen)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          square: 'e1',
          piece: 'knight',
          color: 'black',
        }),
      ]),
    );
  });

  it('shares one in-flight AI request for the same position and applies one validated response', async () => {
    const engine = createFakeEngine();
    const deferredResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove.mockReturnValue(deferredResponse.promise);

    const store = createGameStore({ engine });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');

    const fenBeforeAiMove = store.getState().currentFen;
    const firstRequest = store.getState().requestAiMove();
    const secondRequest = store.getState().requestAiMove();

    await flushAsyncWork();

    expect(engine.requestBestMove).toHaveBeenCalledTimes(1);
    expect(engine.requestBestMove).toHaveBeenCalledWith({
      fen: fenBeforeAiMove,
    });

    deferredResponse.resolve({
      difficulty: 'medium',
      fen: fenBeforeAiMove,
      move: 'e7e5',
    });

    await expect(firstRequest).resolves.toEqual({
      ok: true,
      move: {
        from: 'e7',
        to: 'e5',
        uci: 'e7e5',
      },
    });
    await expect(secondRequest).resolves.toEqual({
      ok: true,
      move: {
        from: 'e7',
        to: 'e5',
        uci: 'e7e5',
      },
    });
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

  it('sets engine thinking while an AI move request is pending and clears it after success', async () => {
    const engine = createFakeEngine();
    const deferredResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove.mockReturnValue(deferredResponse.promise);

    const store = createGameStore({ engine });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');

    const pendingRequest = store.getState().requestAiMove();

    await flushAsyncWork();

    expect(store.getState().isEngineThinking).toBe(true);

    deferredResponse.resolve({
      difficulty: 'medium',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      move: 'e7e5',
    });

    await expect(pendingRequest).resolves.toEqual({
      ok: true,
      move: {
        from: 'e7',
        to: 'e5',
        uci: 'e7e5',
      },
    });

    expect(store.getState().isEngineThinking).toBe(false);
  });

  it('clears engine thinking after an AI move request fails', async () => {
    const engine = createFakeEngine();
    const deferredResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove.mockReturnValue(deferredResponse.promise);

    const store = createGameStore({ engine });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');

    const pendingRequest = store.getState().requestAiMove();

    await flushAsyncWork();

    expect(store.getState().isEngineThinking).toBe(true);

    deferredResponse.reject(new Error('Engine offline'));

    await expect(pendingRequest).resolves.toEqual({
      ok: false,
      error: 'Engine offline',
    });

    expect(store.getState().isEngineThinking).toBe(false);
    expect(store.getState().latestError).toBe('Engine offline');
  });

  it('records a malformed engine response error without updating the position', async () => {
    const engine = createFakeEngine();
    engine.requestBestMove.mockRejectedValue(
      new Error('Stockfish returned an invalid bestmove response.'),
    );

    const store = createGameStore({ engine });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');
    const fenBeforeAiMove = store.getState().currentFen;

    await expect(store.getState().requestAiMove()).resolves.toEqual({
      ok: false,
      error: 'Stockfish returned an invalid bestmove response.',
    });

    expect(store.getState().currentFen).toBe(fenBeforeAiMove);
    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);
    expect(store.getState().isEngineThinking).toBe(false);
    expect(store.getState().latestError).toBe(
      'Stockfish returned an invalid bestmove response.',
    );
  });

  it('clears engine thinking when a pending AI move request is cancelled by starting a new game', async () => {
    const engine = createFakeEngine();
    const deferredResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove.mockReturnValue(deferredResponse.promise);

    const store = createGameStore({ engine });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');
    store.getState().requestAiMove();

    await flushAsyncWork();

    expect(store.getState().isEngineThinking).toBe(true);

    store.getState().startNewGame();

    expect(store.getState().isEngineThinking).toBe(false);
    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
  });

  it('ignores a stale AI response that arrives after starting a new game', async () => {
    const engine = createFakeEngine();
    const deferredResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove.mockReturnValue(deferredResponse.promise);

    const store = createGameStore({ engine });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');
    const pendingRequest = store.getState().requestAiMove();
    const staleFen = store.getState().currentFen;

    await flushAsyncWork();

    store.getState().startNewGame();

    deferredResponse.resolve({
      difficulty: 'medium',
      fen: staleFen,
      move: 'e7e5',
    });

    await expect(pendingRequest).resolves.toEqual({
      ok: false,
      error: 'AI move request was superseded.',
    });

    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
    expect(store.getState().moveHistory).toEqual([]);
    expect(store.getState().isEngineThinking).toBe(false);
    expect(store.getState().latestError).toBeNull();
  });

  it('cancels a pending AI move request through the engine adapter, records a retryable error, and clears thinking state immediately', async () => {
    const engine = createFakeEngine();
    const deferredResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove.mockReturnValue(deferredResponse.promise);

    const store = createGameStore({ engine });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');
    const pendingRequest = store.getState().requestAiMove();

    await flushAsyncWork();

    expect(store.getState().isEngineThinking).toBe(true);

    store.getState().cancelAiMove();

    expect(engine.cancelSearch).toHaveBeenCalledTimes(1);
    expect(store.getState().isEngineThinking).toBe(false);
    expect(store.getState().latestError).toBe(
      'AI move was cancelled. Retry AI move to continue.',
    );

    deferredResponse.resolve({
      difficulty: 'medium',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      move: 'e7e5',
    });

    await expect(pendingRequest).resolves.toEqual({
      ok: false,
      error: 'AI move request was superseded.',
    });

    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);
    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    );
  });

  it('allows a cancelled AI move request to be retried for the same position', async () => {
    const engine = createFakeEngine();
    const firstResponse = createDeferred<BestMoveResponse>();
    const secondResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);

    const store = createGameStore({ engine });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');

    const cancelledRequest = store.getState().requestAiMove();

    await flushAsyncWork();

    store.getState().cancelAiMove();

    expect(store.getState().latestError).toBe(
      'AI move was cancelled. Retry AI move to continue.',
    );

    const retriedRequest = store.getState().requestAiMove();

    await flushAsyncWork();

    expect(engine.requestBestMove).toHaveBeenCalledTimes(2);
    expect(store.getState().latestError).toBeNull();

    firstResponse.resolve({
      difficulty: 'medium',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      move: 'e7e5',
    });

    await expect(cancelledRequest).resolves.toEqual({
      ok: false,
      error: 'AI move request was superseded.',
    });

    secondResponse.resolve({
      difficulty: 'medium',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      move: 'e7e5',
    });

    await expect(retriedRequest).resolves.toEqual({
      ok: true,
      move: {
        from: 'e7',
        to: 'e5',
        uci: 'e7e5',
      },
    });

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
    expect(store.getState().latestError).toBeNull();
  });

  it('does not start an engine search if cancellation happens while setting difficulty', async () => {
    const engine = createFakeEngine();
    const deferredDifficulty = createDeferred<void>();
    engine.setDifficulty.mockReturnValue(deferredDifficulty.promise);

    const store = createGameStore({ engine });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');
    const pendingRequest = store.getState().requestAiMove();

    await flushAsyncWork();

    expect(store.getState().isEngineThinking).toBe(true);
    expect(engine.setDifficulty).toHaveBeenCalledTimes(1);
    expect(engine.requestBestMove).not.toHaveBeenCalled();

    store.getState().cancelAiMove();

    expect(engine.cancelSearch).toHaveBeenCalledTimes(1);
    expect(store.getState().isEngineThinking).toBe(false);

    deferredDifficulty.resolve();

    await expect(pendingRequest).resolves.toEqual({
      ok: false,
      error: 'AI move request was superseded.',
    });

    expect(engine.requestBestMove).not.toHaveBeenCalled();
    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);
  });

  it('ignores a late AI response that arrives after cancellation', async () => {
    const engine = createFakeEngine();
    const deferredResponse = createDeferred<BestMoveResponse>();
    engine.requestBestMove.mockReturnValue(deferredResponse.promise);

    const store = createGameStore({ engine });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');
    const pendingRequest = store.getState().requestAiMove();

    await flushAsyncWork();

    store.getState().cancelAiMove();

    deferredResponse.resolve({
      difficulty: 'medium',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      move: 'e7e5',
    });

    await expect(pendingRequest).resolves.toEqual({
      ok: false,
      error: 'AI move request was superseded.',
    });

    expect(store.getState().moveHistory).toEqual([
      {
        player: 'human',
        uci: 'e2e4',
      },
    ]);
    expect(store.getState().sideToMove).toBe('black');
    expect(store.getState().isEngineThinking).toBe(false);
  });

  it('applies the selected difficulty to the next AI request through the engine adapter', async () => {
    const engine = createFakeEngine();
    const store = createGameStore({ engine });

    store.getState().selectSquare('e2');
    store.getState().attemptHumanMove('e4');

    const fenBeforeAiMove = store.getState().currentFen;

    await store.getState().setAiDifficulty('hard');
    engine.setDifficulty.mockClear();

    engine.requestBestMove.mockResolvedValue({
      difficulty: 'hard',
      fen: fenBeforeAiMove,
      move: 'e7e5',
    });

    await expect(store.getState().requestAiMove()).resolves.toEqual({
      ok: true,
      move: {
        from: 'e7',
        to: 'e5',
        uci: 'e7e5',
      },
    });

    expect(engine.setDifficulty).toHaveBeenCalledTimes(1);
    expect(engine.setDifficulty).toHaveBeenCalledWith('hard');
    expect(engine.requestBestMove).toHaveBeenCalledWith({
      fen: fenBeforeAiMove,
    });
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

  it('exposes checkmate status details from an initial FEN without requesting an engine move', () => {
    const engine = createFakeEngine();
    const store = createGameStore({
      engine,
      initialFen: '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1',
    });

    expect(store.getState().sideToMove).toBe('black');
    expect(store.getState().sideToMoveLabel).toBe('Black to move');
    expect(store.getState().gameStatus).toEqual({
      kind: 'checkmate',
    });
    expect(store.getState().gameStatusLabel).toBe('Checkmate');
    expect(engine.requestBestMove).not.toHaveBeenCalled();
  });

  it.each([
    {
      fen: checkFen,
      expectedStatus: {
        kind: 'check',
      },
      expectedLabel: 'Check',
    },
    {
      fen: stalemateFen,
      expectedStatus: {
        kind: 'stalemate',
      },
      expectedLabel: 'Stalemate',
    },
    {
      fen: drawFen,
      expectedStatus: {
        kind: 'draw',
        reason: 'insufficient-material',
      },
      expectedLabel: 'Draw',
    },
  ])(
    'exposes $expectedLabel status details from an initial FEN without requesting an engine move',
    ({ fen, expectedStatus, expectedLabel }) => {
      const engine = createFakeEngine();
      const store = createGameStore({
        engine,
        initialFen: fen,
      });

      expect(store.getState().gameStatus).toEqual(expectedStatus);
      expect(store.getState().gameStatusLabel).toBe(expectedLabel);
      expect(engine.requestBestMove).not.toHaveBeenCalled();
    },
  );

  it('does not allow human square selection after a drawn game is already over', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
      initialFen: drawFen,
    });

    store.getState().selectSquare('d1');

    expect(store.getState().gameStatus).toEqual({
      kind: 'draw',
      reason: 'insufficient-material',
    });
    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
  });

  it('rejects AI move requests when an initial drawn position is already game over', async () => {
    const engine = createFakeEngine();
    const store = createGameStore({
      engine,
      humanSide: 'black',
      initialFen: drawFen,
    });

    await expect(store.getState().requestAiMove()).resolves.toEqual({
      ok: false,
      error: 'The game is over.',
    });
    expect(store.getState().isEngineThinking).toBe(false);
    expect(store.getState().latestError).toBe('The game is over.');
    expect(store.getState().latestErrorKind).toBe('input');
    expect(engine.requestBestMove).not.toHaveBeenCalled();
  });

  it('resets back to the starting position', () => {
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
    expect(store.getState().gameStatusLabel).toBe('Ongoing');
    expect(store.getState().sideToMove).toBe('white');
    expect(store.getState().sideToMoveLabel).toBe('White to move');
    expect(store.getState().boardResetRevision).toBe(1);
    expect(store.getState().isEngineThinking).toBe(false);
    expect(store.getState().latestError).toBeNull();
  });

  it('increments the reset revision, clears pending promotion state, and preserves the selected difficulty on new game', async () => {
    const store = createGameStore({
      engine: createFakeEngine(),
      initialFen: promotionReadyFen,
    });

    await store.getState().setAiDifficulty('hard');
    store.getState().selectSquare('e7');
    store.getState().attemptHumanMove('e8');

    expect(store.getState().pendingPromotion).toEqual({
      from: 'e7',
      to: 'e8',
      choices: ['queen', 'rook', 'bishop', 'knight'],
    });
    expect(store.getState().boardResetRevision).toBe(0);

    store.getState().startNewGame();

    expect(store.getState().boardResetRevision).toBe(1);
    expect(store.getState().pendingPromotion).toBeNull();
    expect(store.getState().aiDifficulty).toBe('hard');
    expect(store.getState().latestError).toBeNull();
    expect(store.getState().latestErrorKind).toBeNull();
  });

  it('resets to the standard starting position even when the current session began from a custom FEN', () => {
    const store = createGameStore({
      engine: createFakeEngine(),
      initialFen: promotionReadyFen,
    });

    expect(store.getState().currentFen).toBe(promotionReadyFen);

    store.getState().startNewGame();

    expect(store.getState().currentFen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    );
    expect(store.getState().moveHistory).toEqual([]);
    expect(store.getState().pendingPromotion).toBeNull();
    expect(store.getState().selectedSquare).toBeNull();
    expect(store.getState().legalDestinationSquares).toEqual([]);
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

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
