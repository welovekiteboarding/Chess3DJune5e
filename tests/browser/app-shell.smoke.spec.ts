import { expect, test } from '@playwright/test';

test('renders the local chess app shell in a real browser', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('app-shell-title')).toHaveText('3D Chess');
});

test('boots the real browser Stockfish path and applies an AI move from visible board clicks', async ({
  page,
}) => {
  await page.goto('/');

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
