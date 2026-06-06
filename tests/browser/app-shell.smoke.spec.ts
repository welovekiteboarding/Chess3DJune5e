import { expect, test, type Locator } from '@playwright/test';

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

test('renders the local chess app shell in a real browser', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('app-shell-title')).toHaveText('3D Chess');
});

test('boots the real browser Stockfish path and applies an AI move from visible board clicks', async ({
  page,
}) => {
  await page.goto('/');

  const cameraState = page.getByTestId('board-camera-state');
  const e2Square = page.locator(getSquareButton('e2'));
  const e3Square = page.locator(getSquareButton('e3'));
  const e4Square = page.locator(getSquareButton('e4'));
  const e2HitTarget = page.getByTestId('board-hit-target-e2');
  const e4HitTarget = page.getByTestId('board-hit-target-e4');

  await expect(page.getByTestId('board-scene-hit-target-overlay')).toBeVisible();
  await expect(e2HitTarget).toBeVisible();
  await expect(e4HitTarget).toBeVisible();
  await expect(page.locator('[data-testid^="board-square-"]')).toHaveCount(64);
  await expect(page.getByText('No moves yet.')).toBeVisible();
  await expect(page.getByText('Latest error: None')).toBeVisible();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');
  await expect(e2Square).toHaveAttribute('data-piece', 'white pawn');
  await expect(e4Square).toHaveAttribute('data-piece', 'empty');

  const defaultE2Position = await getProjectedSquarePosition(e2Square);
  const defaultE4Position = await getProjectedSquarePosition(e4Square);

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

  expect(resetE2Position).toEqual(defaultE2Position);
  expect(resetE4Position).toEqual(defaultE4Position);

  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');
  await expect(e2Square).toHaveAttribute('data-screen-x', String(defaultE2Position.x));
  await expect(e2Square).toHaveAttribute('data-screen-y', String(defaultE2Position.y));

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
  await expect(page.getByText('1. human e2e4')).toBeVisible();

  const moveHistoryItems = page.locator('section[aria-label="Move history"] li');

  await expect(moveHistoryItems).toHaveCount(2, { timeout: 15000 });
  await expect(moveHistoryItems.nth(1)).toHaveText(/\d+\. ai ([a-h][1-8][a-h][1-8][nbrq]?)/);
  await expect(page.getByText('Engine idle')).toBeVisible({ timeout: 15000 });

  const aiMoveText = await moveHistoryItems.nth(1).innerText();
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
});
