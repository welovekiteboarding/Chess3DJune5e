import { expect, test } from '@playwright/test';

function expectBoxWithin(outerBox: NonNullable<Awaited<ReturnType<typeof getBox>>>, innerBox: NonNullable<Awaited<ReturnType<typeof getBox>>>) {
  expect(innerBox.x).toBeGreaterThanOrEqual(outerBox.x);
  expect(innerBox.y).toBeGreaterThanOrEqual(outerBox.y);
  expect(innerBox.x + innerBox.width).toBeLessThanOrEqual(
    outerBox.x + outerBox.width,
  );
  expect(innerBox.y + innerBox.height).toBeLessThanOrEqual(
    outerBox.y + outerBox.height,
  );
}

async function getBox(locator: Parameters<typeof expect>[0]) {
  return await locator.boundingBox();
}

function getSquareButton(
  overlay: Parameters<typeof expect>[0],
  square: string,
) {
  return overlay.getByRole('button', { name: `${square} square` });
}

function parseMoveSquares(uciMove: string) {
  return {
    from: uciMove.slice(0, 2),
    to: uciMove.slice(2, 4),
  };
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

  const boardScene = page.getByTestId('board-scene');
  const cameraState = page.getByTestId('board-camera-state');
  const overlay = page.getByTestId('board-scene-interaction-overlay');
  const e2Square = getSquareButton(overlay, 'e2');
  const e3Square = getSquareButton(overlay, 'e3');
  const e4Square = getSquareButton(overlay, 'e4');

  const boardSceneBox = await getBox(boardScene);
  const overlayBox = await getBox(overlay);
  const e2SquareBox = await getBox(e2Square);
  const e4SquareBox = await getBox(e4Square);

  expect(boardSceneBox).not.toBeNull();
  expect(overlayBox).not.toBeNull();
  expect(e2SquareBox).not.toBeNull();
  expect(e4SquareBox).not.toBeNull();

  expectBoxWithin(boardSceneBox!, overlayBox!);
  expectBoxWithin(overlayBox!, e2SquareBox!);
  expectBoxWithin(overlayBox!, e4SquareBox!);

  await expect(overlay.getByRole('button', { name: / square$/i })).toHaveCount(64);
  await expect(page.getByText('No moves yet.')).toBeVisible();
  await expect(page.getByText('Latest error: None')).toBeVisible();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');
  await expect(e2Square).toHaveAttribute('data-piece', 'white pawn');
  await expect(e4Square).toHaveAttribute('data-piece', 'empty');

  await page.getByRole('button', { name: 'Overhead view' }).click();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'overhead');

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'custom');

  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(cameraState).toHaveAttribute('data-view-mode', 'default');

  await e2Square.click();

  await expect(e2Square).toHaveAttribute('aria-pressed', 'true');
  await expect(e3Square).toHaveAttribute('data-legal-destination', 'true');
  await expect(e4Square).toHaveAttribute('data-legal-destination', 'true');

  await e4Square.click();

  await expect(e2Square).toHaveAttribute('data-piece', 'empty');
  await expect(e4Square).toHaveAttribute('data-piece', 'white pawn');
  await expect(e4Square).toHaveAttribute('aria-pressed', 'false');
  await expect(e3Square).toHaveAttribute('data-legal-destination', 'false');
  await expect(e4Square).toHaveAttribute('data-legal-destination', 'false');
  await expect(page.getByText('Engine thinking')).toBeVisible();
  await expect(page.getByText('1. human e2e4')).toBeVisible();
  await expect(page.getByText('Latest error: None')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry AI move' })).toHaveCount(0);

  const moveHistoryItems = page.locator('section[aria-label="Move history"] li');

  await expect(moveHistoryItems).toHaveCount(2);
  await expect(moveHistoryItems.nth(1)).toHaveText(/\d+\. ai ([a-h][1-8][a-h][1-8][nbrq]?)/);
  await expect(page.getByText('Engine idle')).toBeVisible();

  const aiMoveText = await moveHistoryItems.nth(1).innerText();
  const aiMoveMatch = aiMoveText.match(/\d+\. ai ([a-h][1-8][a-h][1-8][nbrq]?)/);

  expect(aiMoveMatch).not.toBeNull();

  const aiMove = aiMoveMatch?.[1];

  expect(aiMove).toBeDefined();

  const { from, to } = parseMoveSquares(aiMove!);

  await expect(getSquareButton(overlay, from)).toHaveAttribute('data-piece', 'empty');
  await expect(getSquareButton(overlay, to)).toHaveAttribute('data-piece', /^(black) /);
});
