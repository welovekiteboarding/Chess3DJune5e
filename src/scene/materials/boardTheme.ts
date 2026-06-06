import { Color } from 'three';

export interface ProceduralBoardSquare {
  fileIndex: number;
  isDark: boolean;
  rankIndex: number;
}

export interface BoardSquareFinish {
  accentAxis: 'file' | 'rank';
  accentColor: string;
  accentOffset: number;
  baseColor: string;
  edgeColor: string;
  insetColor: string;
  metalness: number;
  roughness: number;
}

export const boardGeometry = {
  boardHalfSpan: 3.5,
  boardSpan: 8,
  frameCornerSize: 0.88,
  frameOverhang: 0.72,
  frameRailHeight: 0.14,
  frameRailThickness: 0.74,
  innerTrimHeight: 0.08,
  innerTrimThickness: 0.14,
  legalMarkerHeight: 0.048,
  legalMarkerRadius: 0.22,
  legalMarkerRingRadius: 0.34,
  legalMarkerRingTube: 0.04,
  markerLift: 0.04,
  plinthHeight: 0.24,
  selectedFrameDepth: 0.038,
  selectedFrameThickness: 0.12,
  squareAccentHeight: 0.014,
  squareAccentInset: 0.22,
  squareAccentLength: 0.52,
  squareAccentWidth: 0.1,
  squareFieldHeight: 0.056,
  squareFieldScale: 0.94,
  squareHeight: 0.18,
  squareInsetHeight: 0.032,
  squareInsetScale: 0.8,
  squareSize: 1,
  squareSurfaceY: 0.09,
} as const;

export const boardVisualContract = {
  darkSquareMaterialId: 'walnut-slate-inlay',
  frameStyleId: 'walnut-bevel-frame',
  legalMarkerStyleId: 'glass-dot-marker',
  lightSquareMaterialId: 'maple-stone-inlay',
  selectedMarkerStyleId: 'brass-perimeter-highlight',
} as const;

export const boardInteractionPalette = {
  legalMarkerColor: '#5e874f',
  legalMarkerCoreColor: '#eef8cf',
  legalMarkerRingColor: '#5b8c4e',
  selectedBorderColor: '#2a180a',
  selectedGlowColor: '#f2cf83',
} as const;

export const boardFramePalette = {
  innerTrimColor: '#322117',
  plinthColor: '#1e1510',
  plinthEdgeColor: '#2a1d15',
  railColor: '#65412d',
  railHighlightColor: '#8f6246',
} as const;

const lightSquarePalette = {
  accentColor: '#f7ead1',
  baseColor: '#b99773',
  edgeColor: '#8f7257',
  insetColor: '#ddc7a5',
} as const;

const darkSquarePalette = {
  accentColor: '#916b50',
  baseColor: '#614231',
  edgeColor: '#493225',
  insetColor: '#775944',
} as const;

export function getBoardSquareFinish(
  boardSquare: ProceduralBoardSquare,
): BoardSquareFinish {
  const palette = boardSquare.isDark ? darkSquarePalette : lightSquarePalette;
  const variantSeed = Math.sin(
    boardSquare.fileIndex * 1.73 + boardSquare.rankIndex * 2.41,
  );
  const secondarySeed = Math.cos(
    boardSquare.fileIndex * 1.19 - boardSquare.rankIndex * 1.57,
  );
  const tertiarySeed = Math.sin(
    boardSquare.fileIndex * 2.87 - boardSquare.rankIndex * 0.83,
  );
  const lightnessShift = variantSeed * (boardSquare.isDark ? 0.05 : 0.06);
  const saturationShift = secondarySeed * 0.045;
  const hueShift = (variantSeed + secondarySeed) * 0.006;
  const accentOffsetSign =
    (boardSquare.fileIndex + boardSquare.rankIndex) % 2 === 0 ? 1 : -1;

  return {
    accentAxis:
      (boardSquare.fileIndex + boardSquare.rankIndex) % 2 === 0 ? 'file' : 'rank',
    accentColor: shiftHexColor(
      palette.accentColor,
      hueShift + tertiarySeed * 0.015,
      saturationShift * 0.85 + tertiarySeed * 0.02,
      lightnessShift * 1.1 + tertiarySeed * 0.035,
    ),
    accentOffset: boardGeometry.squareAccentInset * accentOffsetSign,
    baseColor: shiftHexColor(
      palette.baseColor,
      hueShift,
      saturationShift * 0.85,
      lightnessShift * 0.58,
    ),
    edgeColor: shiftHexColor(
      palette.edgeColor,
      hueShift * 0.6,
      saturationShift * 0.45,
      lightnessShift * 0.35,
    ),
    insetColor: shiftHexColor(
      palette.insetColor,
      hueShift * 0.7,
      saturationShift * 0.65,
      lightnessShift,
    ),
    metalness: boardSquare.isDark ? 0.18 : 0.1,
    roughness: boardSquare.isDark ? 0.56 : 0.62,
  };
}

export function getBoardFrameSegmentFinish(segmentIndex: number) {
  const variant = [-0.028, 0.018, -0.012, 0.026][segmentIndex % 4];

  return {
    color: shiftHexColor(boardFramePalette.railColor, 0.004, 0.045, variant),
    highlightColor: shiftHexColor(
      boardFramePalette.railHighlightColor,
      0.006,
      0.05,
      variant * 0.9,
    ),
    metalness: 0.1,
    roughness: 0.5,
  };
}

function shiftHexColor(
  baseColor: string,
  hueShift: number,
  saturationShift: number,
  lightnessShift: number,
) {
  const color = new Color(baseColor);
  const hsl = { h: 0, l: 0, s: 0 };

  color.getHSL(hsl);
  color.setHSL(
    normalizeHue(hsl.h + hueShift),
    clamp(hsl.s + saturationShift, 0, 1),
    clamp(hsl.l + lightnessShift, 0, 1),
  );

  return `#${color.getHexString()}`;
}

function normalizeHue(value: number) {
  return ((value % 1) + 1) % 1;
}

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.min(Math.max(value, minValue), maxValue);
}
