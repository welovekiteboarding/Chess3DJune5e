import { Chess } from 'chess.js';

import type {
  ChessGameState,
  ChessGameStatus,
  ChessLegalMove,
  ChessLoadResult,
  ChessMove,
  ChessMoveResult,
  ChessPiece,
  ChessPiecePlacement,
  ChessPlayer,
  ChessPromotionPiece,
  ChessSquare,
  ChessUciMove,
} from './chessTypes';

const UCI_MOVE_PATTERN = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;
const CHESS_SQUARE_PATTERN = /^[a-h][1-8]$/;
const BOARD_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const FEN_PIECE_MAP: Record<string, ChessPiece> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

type ChessJsMove = {
  from: ChessSquare;
  to: ChessSquare;
  promotion?: ChessPromotionPiece;
  san: string;
};

export function createInitialGameState(): ChessGameState {
  return toGameState(new Chess());
}

export function loadGameStateFromFen(fen: string): ChessLoadResult {
  try {
    return {
      ok: true,
      gameState: toGameState(new Chess(fen)),
    };
  } catch {
    return invalidFenResult(fen);
  }
}

export function getFen(gameState: ChessGameState): string {
  return gameState.fen;
}

export function getLegalMoves(
  gameState: ChessGameState,
  square: ChessSquare,
): ChessLegalMove[] {
  if (!isChessSquare(square)) {
    return [];
  }

  const chess = fromGameState(gameState);

  return chess
    .moves({
      square,
      verbose: true,
    })
    .map((move) => ({
      from: move.from as ChessSquare,
      to: move.to as ChessSquare,
      ...(move.promotion
        ? { promotion: move.promotion as ChessPromotionPiece }
        : {}),
      san: move.san,
      uci: toUciMove({
        from: move.from as ChessSquare,
        to: move.to as ChessSquare,
        ...(move.promotion
          ? { promotion: move.promotion as ChessPromotionPiece }
          : {}),
      }),
    }));
}

export function applyMove(
  gameState: ChessGameState,
  move: ChessMove,
): ChessMoveResult {
  const chess = fromGameState(gameState);
  const legalMove = findLegalMove(chess, move);

  if (!legalMove) {
    return illegalMoveResult(move);
  }

  chess.move({
    from: legalMove.from,
    to: legalMove.to,
    ...(legalMove.promotion ? { promotion: legalMove.promotion } : {}),
  });

  return {
    ok: true,
    gameState: toGameState(chess),
    move: {
      from: legalMove.from,
      to: legalMove.to,
      ...(legalMove.promotion ? { promotion: legalMove.promotion } : {}),
      uci: toUciMove(legalMove),
    },
  };
}

export function applyUciMove(
  gameState: ChessGameState,
  uciMove: ChessUciMove | string,
): ChessMoveResult {
  const parsedMove = parseUciMove(uciMove);

  if (!parsedMove) {
    return {
      ok: false,
      error: {
        code: 'invalid-uci',
        message: `Invalid UCI move: ${uciMove}`,
      },
    };
  }

  return applyMove(gameState, parsedMove);
}

export function getTurn(gameState: ChessGameState): ChessPlayer {
  return fromGameState(gameState).turn() === 'w' ? 'white' : 'black';
}

export function getGameStatus(gameState: ChessGameState): ChessGameStatus {
  const chess = fromGameState(gameState);

  if (chess.isCheckmate()) {
    return {
      kind: 'checkmate',
    };
  }

  if (chess.isStalemate()) {
    return {
      kind: 'stalemate',
    };
  }

  if (chess.isDraw()) {
    return {
      kind: 'draw',
      reason: chess.isInsufficientMaterial() ? 'insufficient-material' : 'draw',
    };
  }

  if (chess.isCheck()) {
    return {
      kind: 'check',
    };
  }

  return {
    kind: 'ongoing',
  };
}

export function getPiecePlacementsFromFen(fen: string): ChessPiecePlacement[] {
  const loadResult = loadGameStateFromFen(fen);

  if (!loadResult.ok) {
    return [];
  }

  const [boardState] = loadResult.gameState.fen.split(' ');

  if (!boardState) {
    return [];
  }

  return boardState.split('/').flatMap((rank, rankIndex) => {
    const piecePlacements: ChessPiecePlacement[] = [];
    let fileIndex = 0;

    for (const symbol of rank) {
      const emptySquares = Number(symbol);

      if (Number.isInteger(emptySquares) && emptySquares > 0) {
        fileIndex += emptySquares;
        continue;
      }

      const piecePlacement = createPiecePlacement(symbol, fileIndex, rankIndex);

      if (piecePlacement) {
        piecePlacements.push(piecePlacement);
      }

      fileIndex += 1;
    }

    return piecePlacements;
  });
}

function fromGameState(gameState: ChessGameState): Chess {
  return new Chess(gameState.fen);
}

function toGameState(chess: Chess): ChessGameState {
  return {
    fen: chess.fen(),
  };
}

function findLegalMove(chess: Chess, move: ChessMove): ChessJsMove | null {
  if (!isChessSquare(move.from) || !isChessSquare(move.to)) {
    return null;
  }

  const legalMoves = chess.moves({
    square: move.from,
    verbose: true,
  });

  const matchingMove = legalMoves.find(
    (candidate) =>
      candidate.to === move.to && candidate.promotion === move.promotion,
  );

  if (!matchingMove) {
    return null;
  }

  return {
    from: matchingMove.from as ChessSquare,
    to: matchingMove.to as ChessSquare,
    ...(matchingMove.promotion
      ? { promotion: matchingMove.promotion as ChessPromotionPiece }
      : {}),
    san: matchingMove.san,
  };
}

function toUciMove(move: ChessMove): ChessUciMove {
  return `${move.from}${move.to}${move.promotion ?? ''}` as ChessUciMove;
}

function parseUciMove(uciMove: string): ChessMove | null {
  const match = UCI_MOVE_PATTERN.exec(uciMove);

  if (!match) {
    return null;
  }

  const [, from, to, promotion] = match;

  return {
    from: from as ChessSquare,
    to: to as ChessSquare,
    ...(promotion ? { promotion: promotion as ChessPromotionPiece } : {}),
  };
}

function isChessSquare(square: string): square is ChessSquare {
  return CHESS_SQUARE_PATTERN.test(square);
}

function createPiecePlacement(
  symbol: string,
  fileIndex: number,
  rankIndex: number,
): ChessPiecePlacement | null {
  const file = BOARD_FILES[fileIndex];
  const rank = 8 - rankIndex;
  const normalizedSymbol = symbol.toLowerCase();
  const piece = FEN_PIECE_MAP[normalizedSymbol];

  if (!piece || !file || rank < 1 || rank > 8) {
    return null;
  }

  const square = `${file}${rank}` as ChessSquare;
  const color: ChessPlayer =
    symbol === normalizedSymbol ? 'black' : 'white';

  return {
    renderId: `${color}-${piece}-${square}`,
    square,
    color,
    piece,
  };
}

function invalidFenResult(fen: string): ChessLoadResult {
  return {
    ok: false,
    error: {
      code: 'invalid-fen',
      message: `Invalid FEN: ${fen}`,
    },
  };
}

function illegalMoveResult(move: ChessMove): ChessMoveResult {
  return {
    ok: false,
    error: {
      code: 'illegal-move',
      message: `Illegal move: ${toUciMove(move)}`,
    },
  };
}
