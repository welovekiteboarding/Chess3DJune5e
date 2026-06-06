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
    expect(boardVisualContract.lightSquareMaterialId).toBe('maple-stone-inlay');
    expect(boardVisualContract.darkSquareMaterialId).toBe('walnut-slate-inlay');
    expect(boardVisualContract.legalMarkerStyleId).toBe('glass-dot-marker');
    expect(boardVisualContract.selectedMarkerStyleId).toBe(
      'brass-perimeter-highlight',
    );

    expect(boardGeometry.frameOverhang).toBeGreaterThan(0.45);
    expect(boardGeometry.frameRailHeight).toBeGreaterThan(0.08);
    expect(boardGeometry.frameRailHeight).toBeLessThan(boardGeometry.squareHeight);
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

    expect(getContrastRatio(lightSquare.insetColor, darkSquare.insetColor)).toBeGreaterThan(
      2.8,
    );
    expect(getContrastRatio(lightSquare.accentColor, darkSquare.insetColor)).toBeGreaterThan(
      2,
    );
    expect(getContrastRatio(darkSquare.accentColor, lightSquare.insetColor)).toBeGreaterThan(
      1.8,
    );
  });

  it('adds deterministic procedural variation inside each square family', () => {
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

    expect(nearLightSquare.insetColor).not.toBe(farLightSquare.insetColor);
    expect(nearLightSquare.accentColor).not.toBe(farLightSquare.accentColor);
    expect(nearDarkSquare.insetColor).not.toBe(farDarkSquare.insetColor);
    expect(nearDarkSquare.accentColor).not.toBe(farDarkSquare.accentColor);
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
        lightSquare.insetColor,
      ),
    ).toBeGreaterThan(1.5);
    expect(
      getContrastRatio(
        boardInteractionPalette.selectedBorderColor,
        darkSquare.insetColor,
      ),
    ).toBeGreaterThan(2.2);
    expect(
      getContrastRatio(
        boardInteractionPalette.legalMarkerColor,
        lightSquare.insetColor,
      ),
    ).toBeGreaterThan(1.4);
    expect(
      getContrastRatio(
        boardInteractionPalette.legalMarkerColor,
        darkSquare.insetColor,
      ),
    ).toBeGreaterThan(1.4);
  });
});
