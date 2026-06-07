import { expect, test, type Locator, type Page } from '@playwright/test';

interface ProjectedSquarePosition {
  visible: boolean;
  x: number;
  y: number;
}

function getSquareButton(square: string) {
  return `[data-testid="board-square-${square}"]`;
}

function parseMoveSquares(uciMove: string) {
  return {
    from: uciMove.slice(0, 2),
    to: uciMove.slice(2, 4),
  };
}

function getProjectedDistance(
  firstPosition: ProjectedSquarePosition,
  secondPosition: ProjectedSquarePosition,
) {
  return Math.hypot(
    secondPosition.x - firstPosition.x,
    secondPosition.y - firstPosition.y,
  );
}

async function getProjectedSquarePosition(
  squareButton: Locator,
): Promise<ProjectedSquarePosition> {
  await expect(squareButton).toHaveAttribute('data-screen-visible', 'true');

  return await squareButton.evaluate((node) => {
    const x = Number(node.getAttribute('data-screen-x'));
    const y = Number(node.getAttribute('data-screen-y'));
    const visible = node.getAttribute('data-screen-visible') === 'true';

    return { visible, x, y };
  });
}

async function getCameraDistance(cameraState: Locator): Promise<number> {
  return Number(await cameraState.getAttribute('data-distance'));
}

async function getCameraMetrics(cameraState: Locator) {
  const [
    azimuth,
    distance,
    maxDistance,
    minDistance,
    polar,
    screenUpAngle,
  ] = await Promise.all([
    cameraState.getAttribute('data-azimuth'),
    cameraState.getAttribute('data-distance'),
    cameraState.getAttribute('data-max-distance'),
    cameraState.getAttribute('data-min-distance'),
    cameraState.getAttribute('data-polar'),
    cameraState.getAttribute('data-screen-up-angle'),
  ]);

  return {
    azimuth: Number(azimuth),
    distance: Number(distance),
    maxDistance: Number(maxDistance),
    minDistance: Number(minDistance),
    polar: Number(polar),
    screenUpAngle: Number(screenUpAngle),
  };
}

async function clickRenderedSquare(page: Page, square: string) {
  const squareButton = page.locator(getSquareButton(square));
  const squareHitTarget = page.getByTestId(`board-hit-target-${square}`);

  await expect
    .poll(
      async () => ({
        hitTargetCount: await squareHitTarget.count(),
        visible: await squareButton.getAttribute('data-screen-visible'),
      }),
      { timeout: 15_000 },
    )
    .toEqual({
      hitTargetCount: 1,
      visible: 'true',
    });
  await squareHitTarget.dispatchEvent('click');
}

async function clickCameraButton(page: Page, name: string) {
  const cameraButton = page.getByRole('button', { name });
  await expect(cameraButton).toBeVisible();
  await cameraButton.dispatchEvent('click');
}

async function waitForPieceAnimationToSettle(
  page: Page,
  piece: Locator,
  { expectMotion = false }: { expectMotion?: boolean } = {},
) {
  if (expectMotion) {
    await expect(piece).toHaveAttribute('data-animation-duration-ms', '260');
    await expect(
      page.getByTestId('board-piece-animation-state'),
    ).toHaveAttribute('data-animation-duration-ms', '260');
  }

  await expect(piece).toHaveAttribute('data-animation-state', 'idle', {
    timeout: 5000,
  });
}

async function waitForPieceAtSquareToSettle(
  page: Page,
  square: string,
  color: 'white' | 'black',
  options?: { expectMotion?: boolean },
) {
  await waitForPieceAnimationToSettle(
    page,
    page.locator(
      `[data-testid="board-piece"][data-square="${square}"][data-color="${color}"]`,
    ),
    options,
  );
}

function getPieceAtSquare(page: Page, square: string, color: 'white' | 'black') {
  return page.locator(
    `[data-testid="board-piece"][data-square="${square}"][data-color="${color}"]`,
  );
}

async function expectResolvedPieceIdentity(
  page: Page,
  square: string,
  color: 'white' | 'black',
) {
  const piece = getPieceAtSquare(page, square, color);

  await expect(piece).toHaveCount(1);
  await expect(piece).toHaveAttribute(
    'data-render-id',
    new RegExp(`^${color}-(bishop|king|knight|pawn|queen|rook)-${square}$`),
  );

  const renderId = await piece.getAttribute('data-render-id');

  expect(renderId).not.toBeNull();

  const pieceIdentity = page.getByTestId(`board-piece-${renderId!}`);

  await expect(pieceIdentity).toHaveAttribute('data-square', square);
  await expect(pieceIdentity).toHaveAttribute('data-animation-state', 'idle');

  return {
    piece,
    pieceIdentity,
    renderId: renderId!,
  };
}

async function expectResolvedPieceIdentities(
  page: Page,
  pieces: ReadonlyArray<{
    color: 'white' | 'black';
    square: string;
  }>,
) {
  for (const piece of pieces) {
    await expectResolvedPieceIdentity(page, piece.square, piece.color);
  }
}

async function waitForPieceAnimationsToComplete(
  page: Page,
  { expectMotion = false }: { expectMotion?: boolean } = {},
) {
  const pieceAnimationState = page.getByTestId('board-piece-animation-state');

  if (expectMotion) {
    await expect
      .poll(
        async () =>
          Number(
            await pieceAnimationState.getAttribute('data-active-piece-animations'),
          ),
        { timeout: 5000 },
      )
      .toBeGreaterThan(0);
  }

  await expect(pieceAnimationState).toHaveAttribute(
    'data-active-piece-animations',
    '0',
    { timeout: 5000 },
  );
}

async function expectMoveHistoryEntry(
  page: Page,
  index: number,
  pattern: RegExp | string,
) {
  await expect(
    page.locator(
      `[data-testid="move-history-item"][data-move-index="${index}"]`,
    ),
  ).toHaveText(pattern);
}

test('renders the local chess app shell in a real browser', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('app-shell-title')).toHaveText('3D Chess');
});

test('keeps the board flat while orbiting and clamps camera zoom to useful bounds', async ({
  page,
}) => {
  test.setTimeout(75_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const cameraState = page.getByTestId('board-camera-state');
  const boardCanvasShell = page.getByTestId('board-scene-canvas-shell');

  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');

  const defaultCameraMetrics = await getCameraMetrics(cameraState);

  expect(defaultCameraMetrics.minDistance).toBeCloseTo(3.6, 2);
  expect(defaultCameraMetrics.maxDistance).toBeCloseTo(24, 2);
  expect(defaultCameraMetrics.maxDistance - defaultCameraMetrics.minDistance).toBeGreaterThan(20);
  expect(defaultCameraMetrics.screenUpAngle).toBeCloseTo(0, 2);

  for (let rotationStep = 0; rotationStep < 20; rotationStep += 1) {
    await clickCameraButton(page, 'Rotate right');
  }

  const rotatedRightMetrics = await getCameraMetrics(cameraState);

  expect(rotatedRightMetrics.azimuth).toBeGreaterThan(Math.PI * 2);
  expect(rotatedRightMetrics.screenUpAngle).toBeCloseTo(0, 2);

  for (let rotationStep = 0; rotationStep < 6; rotationStep += 1) {
    await clickCameraButton(page, 'Rotate left');
  }

  const rotatedLeftMetrics = await getCameraMetrics(cameraState);

  expect(rotatedLeftMetrics.azimuth).toBeLessThan(rotatedRightMetrics.azimuth);
  expect(rotatedLeftMetrics.screenUpAngle).toBeCloseTo(0, 2);
  expect(rotatedLeftMetrics.polar).toBeCloseTo(defaultCameraMetrics.polar, 2);

  await boardCanvasShell.hover();
  await page.mouse.wheel(0, 180);
  await expect(cameraState).toHaveAttribute('data-view-mode', 'custom');
  await expect
    .poll(async () => (await getCameraMetrics(cameraState)).distance)
    .toBeGreaterThan(defaultCameraMetrics.distance);

  const zoomedOutMetrics = await getCameraMetrics(cameraState);

  expect(zoomedOutMetrics.screenUpAngle).toBeCloseTo(0, 2);

  await page.mouse.wheel(0, -260);
  await expect
    .poll(async () => (await getCameraMetrics(cameraState)).distance)
    .toBeLessThan(zoomedOutMetrics.distance);

  await boardCanvasShell.hover();

  for (let zoomStep = 0; zoomStep < 3; zoomStep += 1) {
    await page.mouse.wheel(0, 1600);
  }

  await expect
    .poll(async () => (await getCameraMetrics(cameraState)).distance)
    .toBeCloseTo(defaultCameraMetrics.maxDistance, 2);

  const maxZoomMetrics = await getCameraMetrics(cameraState);

  expect(maxZoomMetrics.screenUpAngle).toBeCloseTo(0, 2);

  await boardCanvasShell.hover();

  for (let zoomStep = 0; zoomStep < 5; zoomStep += 1) {
    await page.mouse.wheel(0, -1600);
  }

  await expect
    .poll(async () => (await getCameraMetrics(cameraState)).distance)
    .toBeCloseTo(defaultCameraMetrics.minDistance, 2);

  const minZoomMetrics = await getCameraMetrics(cameraState);

  expect(minZoomMetrics.screenUpAngle).toBeCloseTo(0, 2);

  await clickCameraButton(page, 'Reset view');
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');
});

test('boots the real browser Stockfish path and keeps move surfaces stable at default and custom camera angles', async ({
  page,
}) => {
  test.setTimeout(150_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const cameraState = page.getByTestId('board-camera-state');
  const e2Square = page.locator(getSquareButton('e2'));
  const e3Square = page.locator(getSquareButton('e3'));
  const e4Square = page.locator(getSquareButton('e4'));
  const f3Square = page.locator(getSquareButton('f3'));
  const g1Square = page.locator(getSquareButton('g1'));
  await expect(page.getByTestId('board-scene-hit-target-overlay')).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Command deck' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Match status' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Stockfish' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Move history' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Game controls' }),
  ).toBeVisible();
  await expect(page.locator('[data-testid^="board-square-"]')).toHaveCount(64);
  await expect(page.getByText('No moves yet.')).toBeVisible();
  await expect(page.getByText('Latest error: None')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  await expect(page.getByLabel('AI difficulty')).toBeVisible();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');
  await expect(page.getByTestId('board-lighting-contract')).toHaveAttribute(
    'data-lighting-rig',
    'studio-warm-key',
  );
  await expect(page.getByTestId('board-lighting-contract')).toHaveAttribute(
    'data-shadow-style',
    'soft-readable',
  );
  await expect(page.getByTestId('board-visual-contract')).toHaveAttribute(
    'data-corner-decoration-treatment',
    'separated-corner-cap',
  );
  await expect(page.getByTestId('board-visual-contract')).toHaveAttribute(
    'data-corner-join-style',
    'butt-joint',
  );
  await expect(page.getByTestId('board-visual-contract')).toHaveAttribute(
    'data-square-surface-treatment',
    'single-cap-plane',
  );
  await expect(page.getByTestId('board-visual-contract')).toHaveAttribute(
    'data-square-decoration-treatment',
    'none',
  );
  await expect(page.getByTestId('board-visual-contract')).toHaveAttribute(
    'data-frame-rail-span',
    '7.86',
  );
  await expectResolvedPieceIdentities(page, [
    { color: 'white', square: 'a1' },
    { color: 'white', square: 'c1' },
    { color: 'white', square: 'e1' },
    { color: 'white', square: 'g1' },
    { color: 'white', square: 'e2' },
    { color: 'white', square: 'd1' },
    { color: 'black', square: 'a8' },
    { color: 'black', square: 'c8' },
    { color: 'black', square: 'e8' },
    { color: 'black', square: 'g8' },
    { color: 'black', square: 'e7' },
    { color: 'black', square: 'd8' },
  ]);
  await expect(e2Square).toHaveAttribute('data-piece', 'white pawn');
  await expect(e4Square).toHaveAttribute('data-piece', 'empty');
  await expect(page.getByTestId('board-piece-white-king-e1')).toHaveAttribute(
    'data-piece-type',
    'king',
  );
  await expect(page.getByTestId('board-piece-black-queen-d8')).toHaveAttribute(
    'data-piece-type',
    'queen',
  );
  await expect(page.getByTestId('board-piece-white-knight-g1')).toHaveAttribute(
    'aria-label',
    'white knight piece on g1',
  );
  await expect(page.getByTestId('board-piece-black-pawn-e7')).toHaveAttribute(
    'data-piece-marker',
    'orb',
  );

  const initialLayout = await page.evaluate(() => {
    const boardRegion = document.querySelector('[data-testid="board-region"]');
    const panelRegion = document.querySelector('[data-testid="panel-region"]');
    const scrollingElement = document.scrollingElement;

    if (!(boardRegion instanceof HTMLElement)) {
      throw new Error('Board region not found');
    }

    if (!(panelRegion instanceof HTMLElement)) {
      throw new Error('Panel region not found');
    }

    if (!(scrollingElement instanceof HTMLElement)) {
      throw new Error('Scrolling element not found');
    }

    return {
      boardBottom: boardRegion.getBoundingClientRect().bottom,
      boardWidth: boardRegion.getBoundingClientRect().width,
      panelBottom: panelRegion.getBoundingClientRect().bottom,
      panelWidth: panelRegion.getBoundingClientRect().width,
      scrollHeight: scrollingElement.scrollHeight,
      scrollTop: scrollingElement.scrollTop,
      viewportHeight: window.innerHeight,
    };
  });

  expect(initialLayout.boardBottom).toBeLessThanOrEqual(initialLayout.viewportHeight);
  expect(initialLayout.panelBottom).toBeLessThanOrEqual(initialLayout.viewportHeight);
  expect(initialLayout.boardWidth).toBeGreaterThan(initialLayout.panelWidth);
  expect(initialLayout.scrollHeight).toBeLessThanOrEqual(initialLayout.viewportHeight);
  expect(initialLayout.scrollTop).toBe(0);

  const defaultE2Position = await getProjectedSquarePosition(e2Square);

  await clickCameraButton(page, 'Overhead view');
  await expect(cameraState).toHaveAttribute('data-view-mode', 'overhead');
  await expect(page.getByTestId('board-visual-contract')).toHaveAttribute(
    'data-corner-decoration-treatment',
    'separated-corner-cap',
  );

  const overheadE2Position = await getProjectedSquarePosition(e2Square);
  const overheadE4Position = await getProjectedSquarePosition(e4Square);

  expect(overheadE2Position).not.toEqual(defaultE2Position);

  const boardCanvasShell = page.getByTestId('board-scene-canvas-shell');
  const defaultDistance = await getCameraDistance(cameraState);

  await boardCanvasShell.hover();
  await page.mouse.wheel(0, 220);
  await expect(cameraState).toHaveAttribute('data-view-mode', 'custom');
  await expect
    .poll(async () => getCameraDistance(cameraState))
    .toBeGreaterThan(defaultDistance);
  await expect(page.getByTestId('board-visual-contract')).toHaveAttribute(
    'data-corner-join-style',
    'butt-joint',
  );

  const zoomedOutDistance = await getCameraDistance(cameraState);

  await page.mouse.wheel(0, -320);
  await expect
    .poll(async () => getCameraDistance(cameraState))
    .toBeLessThan(zoomedOutDistance);
  await clickCameraButton(page, 'Tilt down');
  await expect(cameraState).toHaveAttribute('data-view-mode', 'custom');
  await expect(page.getByTestId('board-visual-contract')).toHaveAttribute(
    'data-corner-decoration-treatment',
    'separated-corner-cap',
  );

  const zoomedE2Position = await getProjectedSquarePosition(e2Square);
  const zoomedE4Position = await getProjectedSquarePosition(e4Square);

  expect(
    getProjectedDistance(zoomedE2Position, zoomedE4Position),
  ).toBeGreaterThan(getProjectedDistance(overheadE2Position, overheadE4Position));

  await clickCameraButton(page, 'Reset view');
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');
  await expect(page.getByTestId('board-visual-contract')).toHaveAttribute(
    'data-frame-rail-span',
    '7.86',
  );
  await expect
    .poll(async () => getProjectedSquarePosition(e2Square))
    .toEqual(defaultE2Position);

  const resetE2Position = await getProjectedSquarePosition(e2Square);
  const resetE4Position = await getProjectedSquarePosition(e4Square);

  expect(resetE2Position.visible).toBe(true);
  expect(resetE4Position.visible).toBe(true);

  await clickRenderedSquare(page, 'e2');

  await expect(e2Square).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('selected-square-highlight-e2')).toHaveCount(1);
  await expect(page.getByTestId('selected-square-highlight-e2')).toHaveAttribute(
    'data-highlight-contrast',
    'light-dark-ready',
  );
  await expect(e3Square).toHaveAttribute('data-legal-destination', 'true');
  await expect(e4Square).toHaveAttribute('data-legal-destination', 'true');
  await expect(page.getByTestId('legal-destination-marker-e3')).toHaveCount(1);
  await expect(page.getByTestId('legal-destination-marker-e4')).toHaveAttribute(
    'data-marker-treatment',
    'flat-dot',
  );

  await clickRenderedSquare(page, 'e4');
  await waitForPieceAnimationToSettle(
    page,
    page.getByTestId('board-piece-white-pawn-e4'),
    { expectMotion: true },
  );
  await expectResolvedPieceIdentity(page, 'e4', 'white');

  await expect(e2Square).toHaveAttribute('data-piece', 'empty');
  await expect(getPieceAtSquare(page, 'e4', 'white')).toHaveCount(1);
  await expect(e4Square).toHaveAttribute('aria-pressed', 'false');
  await expect(e3Square).toHaveAttribute('data-legal-destination', 'false');
  await expect(e4Square).toHaveAttribute('data-legal-destination', 'false');
  await expectMoveHistoryEntry(page, 0, '1. human e2e4');
  await expect(page.getByTestId('move-history-item')).toHaveCount(2, {
    timeout: 25000,
  });
  await expectMoveHistoryEntry(page, 1, /\d+\. ai ([a-h][1-8][a-h][1-8][nbrq]?)/);
  await expect(page.getByText('Engine idle')).toBeVisible({ timeout: 25000 });
  await waitForPieceAnimationsToComplete(page);

  const aiMoveText = await page
    .locator('[data-testid="move-history-item"][data-move-index="1"]')
    .innerText();
  const aiMoveMatch = aiMoveText.match(/\d+\. ai ([a-h][1-8][a-h][1-8][nbrq]?)/);

  expect(aiMoveMatch).not.toBeNull();

  const aiMove = aiMoveMatch?.[1];

  expect(aiMove).toBeDefined();

  const { from, to } = parseMoveSquares(aiMove!);

  await waitForPieceAtSquareToSettle(page, to, 'black');
  await waitForPieceAnimationsToComplete(page);

  await expect(page.locator(getSquareButton(from))).toHaveAttribute(
    'data-piece',
    'empty',
  );
  await expectResolvedPieceIdentity(page, to, 'black');

  await clickCameraButton(page, 'Rotate left');
  await clickCameraButton(page, 'Zoom out');
  await expect(cameraState).toHaveAttribute('data-view-mode', 'custom');

  await clickRenderedSquare(page, 'g1');
  await expect(g1Square).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('selected-square-highlight-g1')).toHaveCount(1);
  await expect(f3Square).toHaveAttribute('data-legal-destination', 'true');
  await expect(page.getByTestId('legal-destination-marker-f3')).toHaveAttribute(
    'data-marker-treatment',
    'flat-dot',
  );

  await clickRenderedSquare(page, 'f3');
  await waitForPieceAnimationToSettle(
    page,
    page.getByTestId('board-piece-white-knight-f3'),
    { expectMotion: true },
  );
  await expectResolvedPieceIdentity(page, 'f3', 'white');

  await expect(g1Square).toHaveAttribute('data-piece', 'empty');
  await expect(getPieceAtSquare(page, 'f3', 'white')).toHaveCount(1);
  await expectMoveHistoryEntry(page, 2, '3. human g1f3');
  await expect(page.getByTestId('move-history-item')).toHaveCount(4, {
    timeout: 25000,
  });
  await expectMoveHistoryEntry(page, 3, /\d+\. ai ([a-h][1-8][a-h][1-8][nbrq]?)/);
  await expect(page.getByText('Engine idle')).toBeVisible({ timeout: 25000 });

  const secondAiMoveText = await page
    .locator('[data-testid="move-history-item"][data-move-index="3"]')
    .innerText();
  const secondAiMoveMatch = secondAiMoveText.match(
    /\d+\. ai ([a-h][1-8][a-h][1-8][nbrq]?)/,
  );

  expect(secondAiMoveMatch).not.toBeNull();

  const secondAiMove = secondAiMoveMatch?.[1];

  expect(secondAiMove).toBeDefined();

  const { to: secondAiDestination } = parseMoveSquares(secondAiMove!);

  await waitForPieceAtSquareToSettle(page, secondAiDestination, 'black');
  await waitForPieceAnimationsToComplete(page);
  await expectResolvedPieceIdentity(page, secondAiDestination, 'black');

  await clickCameraButton(page, 'Zoom out');
  await clickCameraButton(page, 'Reset view');
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');
  expect(await getCameraDistance(cameraState)).toBeCloseTo(10.4, 1);
});

test('keeps every piece grounded under a side-view camera using deterministic scene data', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const cameraState = page.getByTestId('board-camera-state');

  await clickCameraButton(page, 'Rotate left');
  await clickCameraButton(page, 'Tilt down');
  await clickCameraButton(page, 'Tilt down');
  await expect(cameraState).toHaveAttribute('data-view-mode', 'custom');

  const groundedPieces = await page.locator('[data-testid="board-piece"]').evaluateAll(
    (nodes) =>
      nodes.map((node) => ({
        boardSurfaceY: node.getAttribute('data-board-surface-y'),
        groundingConvention: node.getAttribute('data-grounding-convention'),
        localBaseY: node.getAttribute('data-local-base-y'),
        piece: node.getAttribute('data-piece'),
        placementY: node.getAttribute('data-placement-y'),
      })),
  );

  expect(groundedPieces).toHaveLength(32);
  expect(new Set(groundedPieces.map((piece) => piece.piece))).toEqual(
    new Set(['bishop', 'king', 'knight', 'pawn', 'queen', 'rook']),
  );

  groundedPieces.forEach((piece) => {
    expect(piece.groundingConvention).toBe('local-origin-at-piece-base');
    expect(piece.localBaseY).toBe('0');
    expect(piece.boardSurfaceY).toBe('0.09');
    expect(piece.placementY).toBe('0.09');
  });
});

test('keeps the board visible and scrolls long move history inside the controls panel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?e2e-fixture=1');
  await expect(page.getByTestId('move-history-section')).toBeVisible();
  const moveHistoryScroll = page.getByRole('region', {
    name: 'Move history entries',
  });
  await expect(moveHistoryScroll).toBeVisible();
  await page.waitForFunction(() =>
    Boolean(
      (
        window as Window & {
          __CHESS3D_E2E__?: unknown;
        }
      ).__CHESS3D_E2E__,
    ),
  );

  await page.evaluate((fixtureMoves) => {
    const appWindow = window as Window & {
      __CHESS3D_E2E__?: {
        setMoveHistoryFixture: (moves: readonly string[]) => void;
      };
    };

    if (!appWindow.__CHESS3D_E2E__) {
      throw new Error('Browser fixture hook not found');
    }

    appWindow.__CHESS3D_E2E__.setMoveHistoryFixture(fixtureMoves);
  }, Array.from({ length: 80 }, (_, index) => `${index + 1}. human e2e4`));

  await expect(page.getByTestId('move-history-item')).toHaveCount(80);

  const layoutMetrics = await page.evaluate(() => {
    const boardRegion = document.querySelector('[data-testid="board-region"]');
    const panelScroll = document.querySelector('[data-testid="panel-scroll"]');
    const historySection = document.querySelector('[data-testid="move-history-scroll"]');
    const moveHistoryList = document.querySelector('[data-testid="move-history-list"]');

    if (!(boardRegion instanceof HTMLElement)) {
      throw new Error('Board region not found');
    }

    if (!(panelScroll instanceof HTMLElement)) {
      throw new Error('Panel scroll container not found');
    }

    if (!(historySection instanceof HTMLElement)) {
      throw new Error('Move history section not found');
    }

    if (!(moveHistoryList instanceof HTMLOListElement)) {
      throw new Error('Move history list not found');
    }

    const boardRect = boardRegion.getBoundingClientRect();

    return {
      boardBottom: boardRect.bottom,
      documentScrollHeight: document.documentElement.scrollHeight,
      historyClientHeight: historySection.clientHeight,
      historyScrollHeight: historySection.scrollHeight,
      moveCount: moveHistoryList.childElementCount,
      panelClientHeight: panelScroll.clientHeight,
      panelScrollHeight: panelScroll.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });

  expect(layoutMetrics.documentScrollHeight).toBeLessThanOrEqual(
    layoutMetrics.viewportHeight,
  );
  expect(layoutMetrics.boardBottom).toBeLessThanOrEqual(layoutMetrics.viewportHeight);
  expect(layoutMetrics.panelScrollHeight).toBeLessThanOrEqual(
    layoutMetrics.panelClientHeight,
  );
  expect(layoutMetrics.moveCount).toBe(80);
  expect(layoutMetrics.historyScrollHeight).toBeGreaterThan(
    layoutMetrics.historyClientHeight,
  );

  await moveHistoryScroll.hover();

  const scrollStateBefore = await page.evaluate(() => ({
    historyScrollTop: (
      document.querySelector('[data-testid="move-history-scroll"]') as HTMLElement | null
    )?.scrollTop ?? -1,
    pageScrollTop: document.scrollingElement?.scrollTop ?? -1,
  }));

  await page.mouse.wheel(0, 1600);

  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (
            document.querySelector(
              '[data-testid="move-history-scroll"]',
            ) as HTMLElement | null
          )?.scrollTop ?? -1,
      ),
    )
    .toBeGreaterThan(scrollStateBefore.historyScrollTop);
  await expect
    .poll(async () => page.evaluate(() => document.scrollingElement?.scrollTop ?? -1))
    .toBe(0);

  const scrollStateAfter = await page.evaluate(() => ({
    historyScrollTop: (
      document.querySelector('[data-testid="move-history-scroll"]') as HTMLElement | null
    )?.scrollTop ?? -1,
    pageScrollTop: document.scrollingElement?.scrollTop ?? -1,
  }));

  expect(scrollStateBefore.pageScrollTop).toBe(0);
  expect(scrollStateAfter.pageScrollTop).toBe(0);
  expect(scrollStateAfter.historyScrollTop).toBeGreaterThan(
    scrollStateBefore.historyScrollTop,
  );
});
