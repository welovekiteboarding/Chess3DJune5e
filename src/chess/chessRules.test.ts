import {
  applyMove,
  applyUciMove,
  createInitialGameState,
  getFen,
  getGameDisplayState,
  getGameStatus,
  getLegalMoves,
  getPiecePlacementsFromFen,
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

  it('lists all white promotion choices from a promotion-ready position', () => {
    const gameState = loadGameStateFromFenOrThrow(
      '7k/4P3/8/8/8/8/8/4K3 w - - 0 1',
    );

    expect(getLegalMoves(gameState, 'e7')).toEqual(
      expect.arrayContaining([
        {
          from: 'e7',
          to: 'e8',
          promotion: 'queen',
          san: 'e8=Q+',
          uci: 'e7e8q',
        },
        {
          from: 'e7',
          to: 'e8',
          promotion: 'rook',
          san: 'e8=R+',
          uci: 'e7e8r',
        },
        {
          from: 'e7',
          to: 'e8',
          promotion: 'bishop',
          san: 'e8=B',
          uci: 'e7e8b',
        },
        {
          from: 'e7',
          to: 'e8',
          promotion: 'knight',
          san: 'e8=N',
          uci: 'e7e8n',
        },
      ]),
    );
  });

  it('applies a legal UCI promotion move', () => {
    const gameState = loadGameStateFromFenOrThrow(
      '7k/4P3/8/8/8/8/8/4K3 w - - 0 1',
    );

    const result = applyUciMove(gameState, 'e7e8q');

    expect(result).toEqual({
      ok: true,
      gameState: {
        fen: '4Q2k/8/8/8/8/8/8/4K3 b - - 0 1',
      },
      move: {
        from: 'e7',
        to: 'e8',
        promotion: 'queen',
        uci: 'e7e8q',
      },
    });
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

  it('rejects malformed runtime move coordinates without throwing', () => {
    const gameState = createInitialGameState();
    const malformedMove = {
      from: '',
      to: 'e4',
    } as unknown as Parameters<typeof applyMove>[1];

    expect(() => applyMove(gameState, malformedMove)).not.toThrow();

    expect(applyMove(gameState, malformedMove)).toEqual({
      ok: false,
      error: {
        code: 'illegal-move',
        message: 'Illegal move: e4',
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

  it('returns deterministic piece placements from the starting FEN', () => {
    const gameState = createInitialGameState();
    const piecePlacements = getPiecePlacementsFromFen(getFen(gameState));

    expect(piecePlacements).toHaveLength(32);
    expect(piecePlacements).toEqual(
      expect.arrayContaining([
        {
          renderId: 'white-king-e1',
          square: 'e1',
          color: 'white',
          piece: 'king',
        },
        {
          renderId: 'black-king-e8',
          square: 'e8',
          color: 'black',
          piece: 'king',
        },
      ]),
    );
    expect(
      piecePlacements.filter(
        (piecePlacement) =>
          piecePlacement.color === 'white' &&
          piecePlacement.piece === 'pawn' &&
          piecePlacement.square.endsWith('2'),
      ),
    ).toHaveLength(8);
    expect(
      piecePlacements.filter(
        (piecePlacement) =>
          piecePlacement.color === 'black' &&
          piecePlacement.piece === 'pawn' &&
          piecePlacement.square.endsWith('7'),
      ),
    ).toHaveLength(8);
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

  it('exposes display-ready turn and status details from chess state', () => {
    expect(getGameDisplayState(createInitialGameState())).toEqual({
      sideToMove: 'white',
      sideToMoveLabel: 'White to move',
      gameStatus: {
        kind: 'ongoing',
      },
      gameStatusLabel: 'Ongoing',
    });

    expect(
      getGameDisplayState(
        loadGameStateFromFenOrThrow('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'),
      ),
    ).toEqual({
      sideToMove: 'black',
      sideToMoveLabel: 'Black to move',
      gameStatus: {
        kind: 'checkmate',
      },
      gameStatusLabel: 'Checkmate',
    });
  });
});

function getGameStatusFromFen(fen: string) {
  return getGameStatus(loadGameStateFromFenOrThrow(fen));
}

function loadGameStateFromFenOrThrow(fen: string) {
  const result = loadGameStateFromFen(fen);

  if (!result.ok) {
    throw new Error(`Expected valid FEN: ${fen}`);
  }

  return result.gameState;
}
