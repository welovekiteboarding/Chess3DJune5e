import type { ChessPiece } from '../../chess/chessTypes';

export type ProceduralCrownStyle =
  | 'battlement'
  | 'cross'
  | 'horse-head'
  | 'mitre'
  | 'orb'
  | 'tiara';

export interface ProceduralPieceProfile {
  crownFeatureCount: number;
  crownStyle: ProceduralCrownStyle;
  forwardReach: number;
  hasMitreSlit: boolean;
  silhouetteId: string;
  topFeatureCount: number;
  totalHeight: number;
}

export const proceduralPieceProfiles = {
  bishop: {
    crownFeatureCount: 1,
    crownStyle: 'mitre',
    forwardReach: 0,
    hasMitreSlit: true,
    silhouetteId: 'mitre-slit',
    topFeatureCount: 5,
    totalHeight: 1.14,
  },
  king: {
    crownFeatureCount: 6,
    crownStyle: 'cross',
    forwardReach: 0,
    hasMitreSlit: false,
    silhouetteId: 'royal-cross',
    topFeatureCount: 8,
    totalHeight: 1.3,
  },
  knight: {
    crownFeatureCount: 2,
    crownStyle: 'horse-head',
    forwardReach: 0.28,
    hasMitreSlit: false,
    silhouetteId: 'horse-head',
    topFeatureCount: 6,
    totalHeight: 1.12,
  },
  pawn: {
    crownFeatureCount: 1,
    crownStyle: 'orb',
    forwardReach: 0,
    hasMitreSlit: false,
    silhouetteId: 'simple-orb',
    topFeatureCount: 2,
    totalHeight: 0.88,
  },
  queen: {
    crownFeatureCount: 5,
    crownStyle: 'tiara',
    forwardReach: 0,
    hasMitreSlit: false,
    silhouetteId: 'royal-tiara',
    topFeatureCount: 7,
    totalHeight: 1.18,
  },
  rook: {
    crownFeatureCount: 4,
    crownStyle: 'battlement',
    forwardReach: 0,
    hasMitreSlit: false,
    silhouetteId: 'castle-battlement',
    topFeatureCount: 5,
    totalHeight: 1.02,
  },
} as const satisfies Record<ChessPiece, ProceduralPieceProfile>;

export function getProceduralPieceProfile(piece: ChessPiece) {
  return proceduralPieceProfiles[piece];
}
