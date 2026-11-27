import { expect, test } from '@playwright/test';

// The first-run tour, for a person who skips it, at phone, tablet and desktop widths.
const password = 'a-strong-test-password-1';

async function registerFresh(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a workspace' }).click();
  await page.getByLabel('Full name').fill('Tour Tester');
  await page.getByPlaceholder('Your company or team').fill('Tour SpA');
  await page.getByLabel('Email').fill(`tour-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
}

test('skip with Esc, stays skipped, and can be replayed from Account', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await registerFresh(page);
  const dialog = page.getByRole('dialog', { name: 'Welcome to Galdus' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  // Focus starts on "Next" and Tab stays inside the panel.
  await expect(page.getByRole('button', { name: /^Next/ })).toBeFocused();
  for (let n = 0; n < 5; n += 1) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.tour-panel'))).toBe(true);
  // Arrow keys move, Esc skips.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog', { name: 'Connect a model' })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('dialog', { name: 'Welcome to Galdus' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.locator('.tour-panel')).toHaveCount(0);
  // Replay from Account.
  await page.locator('nav').getByText('Account', { exact: true }).click();
  await page.getByRole('button', { name: 'Replay the tour' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome to Galdus' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const [label, width, height] of [['phone', 360, 760], ['tablet', 768, 1024], ['desktop', 1440, 900]]) {
  test(`fits the screen and highlights its target at ${width}px (${label})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await registerFresh(page);
    const panel = page.locator('.tour-panel');
    await expect(panel).toBeVisible();
    for (let step = 0; step < 7; step += 1) {
      const box = await panel.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      await expect(page.locator('.tour-spot')).toBeVisible();
      if (step < 6) await page.getByRole('button', { name: /^Next/ }).click();
    }
    // No horizontal scroll while the tour is open.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(panel).toHaveCount(0);
  });
}

test('works with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await registerFresh(page);
  await expect(page.getByRole('dialog', { name: 'Welcome to Galdus' })).toBeVisible();
  const transition = await page.locator('.tour-spot').evaluate(e => getComputedStyle(e).transitionDuration);
  expect(['0s', '1e-05s']).toContain(transition);
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
