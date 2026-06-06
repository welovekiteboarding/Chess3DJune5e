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
  await expect(page.locator('[data-testid^="board-square-"]')).toHaveCount(64);
  await expect(page.getByText('No moves yet.')).toBeVisible();
  await expect(page.getByText('Latest error: None')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  await expect(page.getByLabel('AI difficulty')).toBeVisible();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');
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
      panelBottom: panelRegion.getBoundingClientRect().bottom,
      scrollHeight: scrollingElement.scrollHeight,
      scrollTop: scrollingElement.scrollTop,
      viewportHeight: window.innerHeight,
    };
  });

  expect(initialLayout.boardBottom).toBeLessThanOrEqual(initialLayout.viewportHeight);
  expect(initialLayout.panelBottom).toBeLessThanOrEqual(initialLayout.viewportHeight);
  expect(initialLayout.scrollHeight).toBeLessThanOrEqual(initialLayout.viewportHeight);
  expect(initialLayout.scrollTop).toBe(0);

  const defaultE2Position = await getProjectedSquarePosition(e2Square);

  await page.getByRole('button', { name: 'Overhead view' }).click();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'overhead');

  const overheadE2Position = await getProjectedSquarePosition(e2Square);
  const overheadE4Position = await getProjectedSquarePosition(e4Square);

  expect(overheadE2Position).not.toEqual(defaultE2Position);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'custom');

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
  await expect(e3Square).toHaveAttribute('data-legal-destination', 'true');
  await expect(e4Square).toHaveAttribute('data-legal-destination', 'true');

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
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');

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
});

test('keeps the board visible and scrolls long move history inside the controls panel', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('move-history-section')).toBeVisible();
  await expect(page.getByTestId('move-history-scroll')).toBeVisible();

  await page.evaluate(() => {
    const historySection = document.querySelector('[data-testid="move-history-scroll"]');

    if (!(historySection instanceof HTMLElement)) {
      throw new Error('Move history scroll container not found');
    }

    historySection.innerHTML = `
      <ol>
        ${Array.from({ length: 80 }, (_, index) => `<li>${index + 1}. human e2e4</li>`).join('')}
      </ol>
    `;
  });

  const layoutMetrics = await page.evaluate(() => {
    const boardRegion = document.querySelector('[data-testid="board-region"]');
    const panelScroll = document.querySelector('[data-testid="panel-scroll"]');
    const historySection = document.querySelector('[data-testid="move-history-scroll"]');

    if (!(boardRegion instanceof HTMLElement)) {
      throw new Error('Board region not found');
    }

    if (!(panelScroll instanceof HTMLElement)) {
      throw new Error('Panel scroll container not found');
    }

    if (!(historySection instanceof HTMLElement)) {
      throw new Error('Move history section not found');
    }

    const boardRect = boardRegion.getBoundingClientRect();

    return {
      boardBottom: boardRect.bottom,
      documentScrollHeight: document.documentElement.scrollHeight,
      historyScrollHeight: historySection.scrollHeight,
      panelClientHeight: panelScroll.clientHeight,
      panelScrollHeight: panelScroll.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });

  expect(layoutMetrics.documentScrollHeight).toBeLessThanOrEqual(
    layoutMetrics.viewportHeight,
  );
  expect(layoutMetrics.boardBottom).toBeLessThanOrEqual(layoutMetrics.viewportHeight);
  expect(layoutMetrics.panelScrollHeight).toBeGreaterThan(
    layoutMetrics.panelClientHeight,
  );
  expect(layoutMetrics.historyScrollHeight).toBeGreaterThan(
    layoutMetrics.panelClientHeight,
  );
});
