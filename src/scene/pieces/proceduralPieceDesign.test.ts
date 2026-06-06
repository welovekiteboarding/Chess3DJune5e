import type { ChessPiece } from '../../chess/chessTypes';
import {
  getProceduralPieceProfile,
  proceduralPieceProfiles,
} from './proceduralPieceDesign';

describe('proceduralPieceDesign', () => {
  it('defines a distinct Staunton-style silhouette contract for every piece type', () => {
    const pieceTypes: ChessPiece[] = [
      'king',
      'queen',
      'rook',
      'bishop',
      'knight',
      'pawn',
    ];

    const silhouettes = pieceTypes.map((piece) => getProceduralPieceProfile(piece));

    expect(new Set(silhouettes.map((profile) => profile.silhouetteId))).toEqual(
      new Set([
        'royal-cross',
        'royal-tiara',
        'castle-battlement',
        'mitre-slit',
        'horse-head',
        'simple-orb',
      ]),
    );
    expect(new Set(silhouettes.map((profile) => profile.crownStyle))).toEqual(
      new Set(['cross', 'tiara', 'battlement', 'mitre', 'horse-head', 'orb']),
    );
  });

  it('keeps the pawn as the smallest simplest profile and the king as the tallest royal marker', () => {
    const pawn = getProceduralPieceProfile('pawn');
    const rook = getProceduralPieceProfile('rook');
    const queen = getProceduralPieceProfile('queen');
    const king = getProceduralPieceProfile('king');

    expect(pawn.totalHeight).toBeLessThan(rook.totalHeight);
    expect(pawn.topFeatureCount).toBeLessThan(rook.topFeatureCount);
    expect(pawn.topFeatureCount).toBeLessThan(queen.topFeatureCount);
    expect(king.totalHeight).toBeGreaterThan(queen.totalHeight);
    expect(king.topFeatureCount).toBeGreaterThanOrEqual(queen.topFeatureCount);
  });

  it('keeps piece landmarks readable from multiple camera angles', () => {
    expect(getProceduralPieceProfile('rook').crownFeatureCount).toBe(4);
    expect(getProceduralPieceProfile('queen').crownFeatureCount).toBe(5);
    expect(getProceduralPieceProfile('bishop').hasMitreSlit).toBe(true);
    expect(getProceduralPieceProfile('knight').forwardReach).toBeGreaterThan(0.14);
  });

  it('exports profiles for all supported piece types', () => {
    expect(Object.keys(proceduralPieceProfiles).sort()).toEqual([
      'bishop',
      'king',
      'knight',
      'pawn',
      'queen',
      'rook',
    ]);
  });
});
