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

async function clickRenderedSquare(squareHitTarget: Locator) {
  await squareHitTarget.click();
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

test('keeps the board flat while orbiting, clamps wheel zoom to useful bounds, and still plays against Stockfish after camera changes', async ({
  page,
}) => {
  test.setTimeout(45_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const cameraState = page.getByTestId('board-camera-state');
  const boardCanvasShell = page.getByTestId('board-scene-canvas-shell');
  const e2Square = page.locator(getSquareButton('e2'));
  const e4Square = page.locator(getSquareButton('e4'));
  const e2HitTarget = page.getByTestId('board-hit-target-e2');
  const e4HitTarget = page.getByTestId('board-hit-target-e4');

  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');

  const defaultCameraMetrics = await getCameraMetrics(cameraState);

  expect(defaultCameraMetrics.minDistance).toBeCloseTo(3.6, 2);
  expect(defaultCameraMetrics.maxDistance).toBeCloseTo(24, 2);
  expect(defaultCameraMetrics.maxDistance - defaultCameraMetrics.minDistance).toBeGreaterThan(20);
  expect(defaultCameraMetrics.screenUpAngle).toBeCloseTo(0, 2);

  for (let rotationStep = 0; rotationStep < 20; rotationStep += 1) {
    await page.getByRole('button', { name: 'Rotate right' }).click();
  }

  const rotatedRightMetrics = await getCameraMetrics(cameraState);

  expect(rotatedRightMetrics.azimuth).toBeGreaterThan(Math.PI * 2);
  expect(rotatedRightMetrics.screenUpAngle).toBeCloseTo(0, 2);

  for (let rotationStep = 0; rotationStep < 6; rotationStep += 1) {
    await page.getByRole('button', { name: 'Rotate left' }).click();
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

  await clickRenderedSquare(e2HitTarget);

  await expect(e2Square).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('selected-square-highlight-e2')).toHaveAttribute(
    'data-highlight-treatment',
    'dual-ring',
  );
  await expect(e4Square).toHaveAttribute('data-legal-destination', 'true');
  await expect(page.getByTestId('legal-destination-marker-e4')).toHaveAttribute(
    'data-marker-treatment',
    'flat-dot',
  );

  await clickRenderedSquare(e4HitTarget);

  await expect(e2Square).toHaveAttribute('data-piece', 'empty');
  await expect(e4Square).toHaveAttribute('data-piece', 'white pawn');
  await expectMoveHistoryEntry(page, 0, '1. human e2e4');
  await expect(page.getByTestId('move-history-item')).toHaveCount(2, {
    timeout: 25000,
  });
  await expectMoveHistoryEntry(page, 1, /\d+\. ai ([a-h][1-8][a-h][1-8][nbrq]?)/);
  await expect(page.getByText('Engine idle')).toBeVisible({ timeout: 25000 });

  await boardCanvasShell.hover();

  for (let zoomStep = 0; zoomStep < 8; zoomStep += 1) {
    await page.mouse.wheel(0, 1200);
  }

  await expect
    .poll(async () => (await getCameraMetrics(cameraState)).distance)
    .toBeCloseTo(defaultCameraMetrics.maxDistance, 2);

  const maxZoomMetrics = await getCameraMetrics(cameraState);

  expect(maxZoomMetrics.screenUpAngle).toBeCloseTo(0, 2);

  await boardCanvasShell.hover();

  for (let zoomStep = 0; zoomStep < 12; zoomStep += 1) {
    await page.mouse.wheel(0, -1200);
  }

  await expect
    .poll(async () => (await getCameraMetrics(cameraState)).distance)
    .toBeCloseTo(defaultCameraMetrics.minDistance, 2);

  const minZoomMetrics = await getCameraMetrics(cameraState);

  expect(minZoomMetrics.screenUpAngle).toBeCloseTo(0, 2);
});

test('boots the real browser Stockfish path and applies an AI move from visible board clicks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const cameraState = page.getByTestId('board-camera-state');
  const e2Square = page.locator(getSquareButton('e2'));
  const e3Square = page.locator(getSquareButton('e3'));
  const e4Square = page.locator(getSquareButton('e4'));
  const f3Square = page.locator(getSquareButton('f3'));
  const g1Square = page.locator(getSquareButton('g1'));
  const f3HitTarget = page.getByTestId('board-hit-target-f3');
  const e2HitTarget = page.getByTestId('board-hit-target-e2');
  const e4HitTarget = page.getByTestId('board-hit-target-e4');
  const g1HitTarget = page.getByTestId('board-hit-target-g1');

  await expect(page.getByTestId('board-scene-hit-target-overlay')).toBeVisible();
  await expect(e2HitTarget).toBeVisible();
  await expect(e4HitTarget).toBeVisible();
  await expect(g1HitTarget).toBeVisible();
  await expect(f3HitTarget).toBeVisible();
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

  await page.getByRole('button', { name: 'Overhead view' }).click();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'overhead');

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

  const zoomedOutDistance = await getCameraDistance(cameraState);

  await page.mouse.wheel(0, -320);
  await expect
    .poll(async () => getCameraDistance(cameraState))
    .toBeLessThan(zoomedOutDistance);

  const zoomedE2Position = await getProjectedSquarePosition(e2Square);
  const zoomedE4Position = await getProjectedSquarePosition(e4Square);

  expect(
    getProjectedDistance(zoomedE2Position, zoomedE4Position),
  ).toBeGreaterThan(getProjectedDistance(overheadE2Position, overheadE4Position));

  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');

  const resetE2Position = await getProjectedSquarePosition(e2Square);
  const resetE4Position = await getProjectedSquarePosition(e4Square);

  expect(resetE2Position.visible).toBe(true);
  expect(resetE4Position.visible).toBe(true);

  await clickRenderedSquare(e2HitTarget);

  await expect(e2Square).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('selected-square-highlight-e2')).toHaveAttribute(
    'data-highlight-contrast',
    'light-dark-ready',
  );
  await expect(e3Square).toHaveAttribute('data-legal-destination', 'true');
  await expect(e4Square).toHaveAttribute('data-legal-destination', 'true');
  await expect(page.getByTestId('legal-destination-marker-e4')).toHaveAttribute(
    'data-marker-treatment',
    'flat-dot',
  );

  await clickRenderedSquare(e4HitTarget);

  await expect(e2Square).toHaveAttribute('data-piece', 'empty');
  await expect(e4Square).toHaveAttribute('data-piece', 'white pawn');
  await expect(e4Square).toHaveAttribute('aria-pressed', 'false');
  await expect(e3Square).toHaveAttribute('data-legal-destination', 'false');
  await expect(e4Square).toHaveAttribute('data-legal-destination', 'false');
  await expectMoveHistoryEntry(page, 0, '1. human e2e4');
  await expect(page.getByTestId('move-history-item')).toHaveCount(2, {
    timeout: 15000,
  });
  await expectMoveHistoryEntry(page, 1, /\d+\. ai ([a-h][1-8][a-h][1-8][nbrq]?)/);
  await expect(page.getByText('Engine idle')).toBeVisible({ timeout: 15000 });

  const aiMoveText = await page
    .locator('[data-testid="move-history-item"][data-move-index="1"]')
    .innerText();
  const aiMoveMatch = aiMoveText.match(/\d+\. ai ([a-h][1-8][a-h][1-8][nbrq]?)/);

  expect(aiMoveMatch).not.toBeNull();

  const aiMove = aiMoveMatch?.[1];

  expect(aiMove).toBeDefined();

  const { from, to } = parseMoveSquares(aiMove!);

  await expect(page.locator(getSquareButton(from))).toHaveAttribute(
    'data-piece',
    'empty',
  );
  await expect(page.locator(getSquareButton(to))).toHaveAttribute(
    'data-piece',
    /^(black) /,
  );

  await page.getByRole('button', { name: 'Rotate left' }).click();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'custom');

  await clickRenderedSquare(g1HitTarget);
  await expect(g1Square).toHaveAttribute('aria-pressed', 'true');
  await expect(f3Square).toHaveAttribute('data-legal-destination', 'true');

  await clickRenderedSquare(f3HitTarget);

  await expect(g1Square).toHaveAttribute('data-piece', 'empty');
  await expect(f3Square).toHaveAttribute('data-piece', 'white knight');
  await expectMoveHistoryEntry(page, 2, '3. human g1f3');
  await expect(page.getByTestId('move-history-item')).toHaveCount(4, {
    timeout: 15000,
  });
  await expectMoveHistoryEntry(page, 3, /\d+\. ai ([a-h][1-8][a-h][1-8][nbrq]?)/);
  await expect(page.getByText('Engine idle')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');
  expect(await getCameraDistance(cameraState)).toBeCloseTo(10.4, 1);
});

test('keeps every piece grounded under a side-view camera using deterministic scene data', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const cameraState = page.getByTestId('board-camera-state');

  await page.getByRole('button', { name: 'Rotate left' }).click();
  await page.getByRole('button', { name: 'Tilt down' }).click();
  await page.getByRole('button', { name: 'Tilt down' }).click();
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
  await expect(page.getByTestId('move-history-scroll')).toBeVisible();
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
});
