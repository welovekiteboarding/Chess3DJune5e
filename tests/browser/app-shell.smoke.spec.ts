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
  const overlay = page.getByTestId('board-scene-interaction-overlay');
  const e2Square = page.getByRole('button', { name: 'e2 square' });
  const e4Square = page.getByRole('button', { name: 'e4 square' });

  const boardSceneBox = await getBox(boardScene);
  const overlayBox = await getBox(overlay);
  const e2SquareBox = await getBox(e2Square);
  const e4SquareBox = await getBox(e4Square);

  expect(boardSceneBox).not.toBeNull();
  expect(overlayBox).not.toBeNull();
  expect(e2SquareBox).not.toBeNull();
  expect(e4SquareBox).not.toBeNull();

  expectBoxWithin(boardSceneBox!, overlayBox!);
  expectBoxWithin(boardSceneBox!, e2SquareBox!);
  expectBoxWithin(boardSceneBox!, e4SquareBox!);

  await page.getByRole('button', { name: 'e2 square' }).click();
  await page.getByRole('button', { name: 'e4 square' }).click();

  await expect(page.getByText('Engine thinking')).toBeVisible();
  await expect(page.getByText('1. human e2e4')).toBeVisible();
  await expect(page.getByTestId('board-piece-white-pawn-e4')).toBeVisible();

  const moveHistoryItems = page.locator('section[aria-label="Move history"] li');

  await expect(moveHistoryItems).toHaveCount(2);
  await expect(moveHistoryItems.nth(1)).toHaveText(
    /\d+\. ai [a-h][1-8][a-h][1-8][nbrq]?/,
  );
  await expect(page.getByText('Engine idle')).toBeVisible();
});
