import { Color } from 'three';

const boardSpan = 8;
const frameCornerSize = 0.88;
const frameRailThickness = 0.74;
const frameRailSpan = boardSpan + frameRailThickness - frameCornerSize;

export interface ProceduralBoardSquare {
  fileIndex: number;
  isDark: boolean;
  rankIndex: number;
}

export interface BoardSquareFinish {
  edgeColor: string;
  edgeRoughness: number;
  surfaceColor: string;
  surfaceMetalness: number;
  surfaceRoughness: number;
}

export const boardGeometry = {
  boardHalfSpan: 3.5,
  boardSpan,
  frameCornerSize,
  frameOverhang: 0.72,
  frameRailHeight: 0.14,
  frameRailSpan,
  frameRailThickness,
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
  squareAccentHeight: 0,
  squareAccentInset: 0,
  squareAccentLength: 0,
  squareAccentWidth: 0,
  squareBaseHeight: 0.124,
  squareFieldHeight: 0.056,
  squareFieldScale: 0.94,
  squareHeight: 0.18,
  squareInsetHeight: 0.032,
  squareInsetScale: 0.8,
  squareSize: 1,
  squareSurfaceY: 0.09,
  squareTopHeight: 0.056,
  squareTopInset: 0,
} as const;

export const boardVisualContract = {
  cornerDecorationTreatment: 'separated-corner-cap',
  cornerJoinStyle: 'butt-joint',
  darkSquareMaterialId: 'walnut-stable-matte-cap',
  frameStyleId: 'walnut-bevel-frame',
  legalMarkerStyleId: 'glass-dot-marker',
  lightSquareMaterialId: 'maple-stable-matte-cap',
  selectedMarkerStyleId: 'brass-perimeter-highlight',
  squareDecorationTreatment: 'none',
  squareSurfaceTreatment: 'single-cap-plane',
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
  edgeColor: '#a48464',
  surfaceColor: '#ddc7a5',
} as const;

const darkSquarePalette = {
  edgeColor: '#493225',
  surfaceColor: '#775944',
} as const;

export function getBoardSquareFinish(
  boardSquare: ProceduralBoardSquare,
): BoardSquareFinish {
  const palette = boardSquare.isDark ? darkSquarePalette : lightSquarePalette;

  return {
    edgeColor: palette.edgeColor,
    edgeRoughness: boardSquare.isDark ? 0.82 : 0.86,
    surfaceColor: palette.surfaceColor,
    surfaceMetalness: 0.02,
    surfaceRoughness: boardSquare.isDark ? 0.88 : 0.9,
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
