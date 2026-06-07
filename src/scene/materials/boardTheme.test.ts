import {
  boardGeometry,
  boardInteractionPalette,
  boardVisualContract,
  getBoardSquareFinish,
} from './boardTheme';

function getRelativeLuminance(hexColor: string) {
  const normalizedHex = hexColor.replace('#', '');
  const channelPairs =
    normalizedHex.length === 3
      ? normalizedHex.split('').map((channel) => `${channel}${channel}`)
      : normalizedHex.match(/.{1,2}/g) ?? [];

  const [red, green, blue] = channelPairs.map((pair) => {
    const normalizedChannel = parseInt(pair, 16) / 255;

    return normalizedChannel <= 0.03928
      ? normalizedChannel / 12.92
      : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getContrastRatio(firstColor: string, secondColor: string) {
  const firstLuminance = getRelativeLuminance(firstColor);
  const secondLuminance = getRelativeLuminance(secondColor);
  const lighterColor = Math.max(firstLuminance, secondLuminance);
  const darkerColor = Math.min(firstLuminance, secondLuminance);

  return (lighterColor + 0.05) / (darkerColor + 0.05);
}

describe('boardTheme', () => {
  it('defines a framed board contract with readable square contrast', () => {
    expect(boardVisualContract.frameStyleId).toBe('walnut-bevel-frame');
    expect(boardVisualContract.cornerDecorationTreatment).toBe(
      'separated-corner-cap',
    );
    expect(boardVisualContract.cornerJoinStyle).toBe('butt-joint');
    expect(boardVisualContract.cornerSurfaceTreatment).toBe(
      'raised-diamond-cap',
    );
    expect(boardVisualContract.lightSquareMaterialId).toBe('maple-stable-matte-cap');
    expect(boardVisualContract.darkSquareMaterialId).toBe('walnut-stable-matte-cap');
    expect(boardVisualContract.legalMarkerStyleId).toBe('single-overlay-dot');
    expect(boardVisualContract.selectedMarkerStyleId).toBe(
      'single-overlay-square',
    );
    expect(boardVisualContract.squareSurfaceTreatment).toBe('single-cap-plane');
    expect(boardVisualContract.squareDecorationTreatment).toBe('none');

    expect(boardGeometry.frameOverhang).toBeGreaterThan(0.45);
    expect(boardGeometry.frameRailHeight).toBeGreaterThan(0.08);
    expect(boardGeometry.frameRailHeight).toBeLessThan(boardGeometry.squareHeight);
    expect(boardGeometry.frameRailSpan).toBeLessThan(
      boardGeometry.boardSpan + boardGeometry.frameRailThickness,
    );
    expect(boardGeometry.frameCornerCapHeight).toBeGreaterThan(0);
    expect(boardGeometry.frameCornerCapLift).toBeGreaterThan(0);
    expect(boardGeometry.frameCornerCapSize).toBeLessThan(
      boardGeometry.frameCornerSize,
    );
    expect(
      boardGeometry.frameRailSpan + boardGeometry.frameCornerSize,
    ).toBeCloseTo(
      boardGeometry.boardSpan + boardGeometry.frameRailThickness,
      5,
    );
    expect(boardGeometry.squareBaseHeight + boardGeometry.squareTopHeight).toBeCloseTo(
      boardGeometry.squareHeight,
      5,
    );
    expect(boardGeometry.squareSurfaceY).toBeCloseTo(
      boardGeometry.squareHeight / 2,
      5,
    );

    const lightSquare = getBoardSquareFinish({
      fileIndex: 0,
      isDark: false,
      rankIndex: 0,
    });
    const darkSquare = getBoardSquareFinish({
      fileIndex: 1,
      isDark: true,
      rankIndex: 0,
    });

    expect(getContrastRatio(lightSquare.surfaceColor, darkSquare.surfaceColor)).toBeGreaterThan(
      2.8,
    );
    expect(getContrastRatio(lightSquare.edgeColor, darkSquare.surfaceColor)).toBeGreaterThan(
      1.8,
    );
    expect(getContrastRatio(darkSquare.edgeColor, lightSquare.surfaceColor)).toBeGreaterThan(
      1.6,
    );
  });

  it('keeps square colors consistent inside each square family for stable play readability', () => {
    const nearLightSquare = getBoardSquareFinish({
      fileIndex: 0,
      isDark: false,
      rankIndex: 0,
    });
    const farLightSquare = getBoardSquareFinish({
      fileIndex: 6,
      isDark: false,
      rankIndex: 7,
    });
    const nearDarkSquare = getBoardSquareFinish({
      fileIndex: 1,
      isDark: true,
      rankIndex: 0,
    });
    const farDarkSquare = getBoardSquareFinish({
      fileIndex: 7,
      isDark: true,
      rankIndex: 6,
    });

    expect(nearLightSquare.surfaceColor).toBe(farLightSquare.surfaceColor);
    expect(nearLightSquare.edgeColor).toBe(farLightSquare.edgeColor);
    expect(nearDarkSquare.surfaceColor).toBe(farDarkSquare.surfaceColor);
    expect(nearDarkSquare.edgeColor).toBe(farDarkSquare.edgeColor);
  });

  it('keeps interaction markers visible against both square palettes', () => {
    const lightSquare = getBoardSquareFinish({
      fileIndex: 4,
      isDark: false,
      rankIndex: 4,
    });
    const darkSquare = getBoardSquareFinish({
      fileIndex: 5,
      isDark: true,
      rankIndex: 4,
    });

    expect(
      getContrastRatio(
        boardInteractionPalette.selectedBorderColor,
        lightSquare.surfaceColor,
      ),
    ).toBeGreaterThan(1.5);
    expect(
      getContrastRatio(
        boardInteractionPalette.selectedBorderColor,
        darkSquare.surfaceColor,
      ),
    ).toBeGreaterThan(2.2);
    expect(
      getContrastRatio(
        boardInteractionPalette.legalMarkerColor,
        lightSquare.surfaceColor,
      ),
    ).toBeGreaterThan(1.4);
    expect(
      getContrastRatio(
        boardInteractionPalette.legalMarkerColor,
        darkSquare.surfaceColor,
      ),
    ).toBeGreaterThan(1.4);
  });

  it('uses marker geometry that stays readable above the richer board surface', () => {
    expect(boardGeometry.markerLift).toBeGreaterThanOrEqual(0.03);
    expect(boardGeometry.selectedFrameDepth).toBeGreaterThanOrEqual(0.03);
    expect(boardGeometry.legalMarkerHeight).toBeGreaterThanOrEqual(0.04);
    expect(boardGeometry.legalMarkerRadius).toBeGreaterThanOrEqual(0.2);
    expect(boardGeometry.legalMarkerRingRadius).toBeGreaterThan(
      boardGeometry.legalMarkerRadius,
    );
  });

  it('uses a single readable top plane with no decorative square accent geometry', () => {
    const geometry = boardGeometry as unknown as Record<string, number>;

    expect(geometry.squareTopHeight).toBeGreaterThan(0);
    expect(geometry.squareBaseHeight).toBeGreaterThan(0);
    expect(geometry.squareTopInset).toBe(0);
    expect(geometry.squareAccentHeight).toBe(0);
    expect(geometry.squareAccentInset).toBe(0);
    expect(geometry.squareAccentLength).toBe(0);
    expect(geometry.squareAccentWidth).toBe(0);

    expect(geometry.squareBaseHeight + geometry.squareTopHeight).toBeCloseTo(
      boardGeometry.squareHeight,
      5,
    );

    const squareBaseTopY =
      -boardGeometry.squareHeight / 2 + geometry.squareBaseHeight;
    const squareTopY = boardGeometry.squareSurfaceY;

    expect(squareBaseTopY).toBeLessThan(squareTopY);
  });

  it('keeps the decorative corner cap lifted above the frame corner base plane', () => {
    const cornerBaseTopY =
      -boardGeometry.frameRailHeight / 2 + boardGeometry.frameRailHeight;
    const cornerCapBottomY =
      cornerBaseTopY + boardGeometry.frameCornerCapLift;
    const cornerCapTopY =
      cornerCapBottomY + boardGeometry.frameCornerCapHeight;

    expect(cornerCapBottomY).toBeGreaterThan(cornerBaseTopY);
    expect(cornerCapTopY).toBeGreaterThan(cornerCapBottomY);
  });
});
