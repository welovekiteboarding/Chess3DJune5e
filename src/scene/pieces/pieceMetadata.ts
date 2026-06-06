import type { ChessPiece, ChessPiecePlacement } from '../../chess/chessTypes';

export const pieceBaseContactLocalY = 0;
export const pieceGroundingConvention = 'local-origin-at-piece-base';

export const pieceMarkerByType = {
  bishop: 'spire',
  king: 'cross-crown',
  knight: 'horse-head',
  pawn: 'orb',
  queen: 'crown',
  rook: 'battlement',
} as const satisfies Record<ChessPiece, string>;

export function getPieceAccessibleLabel(
  piecePlacement: Pick<ChessPiecePlacement, 'color' | 'piece' | 'square'>,
) {
  return `${piecePlacement.color} ${piecePlacement.piece} piece on ${piecePlacement.square}`;
}
