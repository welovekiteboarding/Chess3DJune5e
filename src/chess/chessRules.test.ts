import {
  applyMove,
  applyUciMove,
  createInitialGameState,
  getFen,
  getGameStatus,
  getLegalMoves,
  getTurn,
  loadGameStateFromFen,
} from './chessRules';

describe('chessRules', () => {
  it('lists legal moves for e2 from the initial position', () => {
    const gameState = createInitialGameState();

    expect(getLegalMoves(gameState, 'e2').map((move) => move.to)).toEqual(
      expect.arrayContaining(['e3', 'e4']),
    );
  });

  it('applies a legal coordinate move from the initial position', () => {
    const gameState = createInitialGameState();

    const result = applyMove(gameState, {
      from: 'e2',
      to: 'e4',
    });

    expect(result).toEqual({
      ok: true,
      gameState: {
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      },
      move: {
        from: 'e2',
        to: 'e4',
        uci: 'e2e4',
      },
    });
  });

  it('applies a legal UCI move from the initial position', () => {
    const gameState = createInitialGameState();

    const result = applyUciMove(gameState, 'e2e4');

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error('Expected UCI move to succeed.');
    }

    expect(getFen(result.gameState)).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    );
    expect(getTurn(result.gameState)).toBe('black');
    expect(result.move.uci).toBe('e2e4');
  });

  it('rejects illegal moves without throwing', () => {
    const gameState = createInitialGameState();

    expect(() =>
      applyMove(gameState, {
        from: 'e2',
        to: 'e5',
      }),
    ).not.toThrow();

    expect(
      applyMove(gameState, {
        from: 'e2',
        to: 'e5',
      }),
    ).toEqual({
      ok: false,
      error: {
        code: 'illegal-move',
        message: 'Illegal move: e2e5',
      },
    });
  });

  it('round-trips a loaded FEN exactly', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 2 3';
    const result = loadGameStateFromFen(fen);

    expect(result).toEqual({
      ok: true,
      gameState: {
        fen,
      },
    });

    if (!result.ok) {
      throw new Error('Expected FEN to load.');
    }

    expect(getFen(result.gameState)).toBe(fen);
  });

  it('exposes ongoing, check, checkmate, stalemate, and draw statuses', () => {
    expect(getGameStatus(createInitialGameState())).toEqual({
      kind: 'ongoing',
    });

    expect(
      getGameStatusFromFen('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1'),
    ).toEqual({
      kind: 'check',
    });

    expect(
      getGameStatusFromFen('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'),
    ).toEqual({
      kind: 'checkmate',
    });

    expect(
      getGameStatusFromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'),
    ).toEqual({
      kind: 'stalemate',
    });

    expect(
      getGameStatusFromFen('8/8/8/8/8/8/2k5/3K4 w - - 0 1'),
    ).toEqual({
      kind: 'draw',
      reason: 'insufficient-material',
    });
  });
});

function getGameStatusFromFen(fen: string) {
  const result = loadGameStateFromFen(fen);

  if (!result.ok) {
    throw new Error(`Expected valid FEN: ${fen}`);
  }

  return getGameStatus(result.gameState);
}
