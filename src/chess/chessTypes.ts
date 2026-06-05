export type ChessPromotionPiece = 'q' | 'r' | 'b' | 'n';

type ChessFile = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
type ChessRank = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

export type ChessSquare = `${ChessFile}${ChessRank}`;
export type ChessUciMove =
  | `${ChessSquare}${ChessSquare}`
  | `${ChessSquare}${ChessSquare}${ChessPromotionPiece}`;

export type ChessPlayer = 'white' | 'black';

export interface ChessGameState {
  fen: string;
}

export interface ChessMove {
  from: ChessSquare;
  to: ChessSquare;
  promotion?: ChessPromotionPiece;
}

export interface ChessLegalMove extends ChessMove {
  san: string;
  uci: ChessUciMove;
}

export interface ChessAppliedMove extends ChessMove {
  uci: ChessUciMove;
}

export type ChessDrawReason = 'insufficient-material' | 'draw';

export type ChessGameStatus =
  | { kind: 'ongoing' }
  | { kind: 'check' }
  | { kind: 'checkmate' }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: ChessDrawReason };

export type ChessRulesErrorCode = 'invalid-fen' | 'illegal-move' | 'invalid-uci';

export interface ChessRulesError {
  code: ChessRulesErrorCode;
  message: string;
}

export type ChessLoadResult =
  | {
      ok: true;
      gameState: ChessGameState;
    }
  | {
      ok: false;
      error: ChessRulesError;
    };

export type ChessMoveResult =
  | {
      ok: true;
      gameState: ChessGameState;
      move: ChessAppliedMove;
    }
  | {
      ok: false;
      error: ChessRulesError;
    };
