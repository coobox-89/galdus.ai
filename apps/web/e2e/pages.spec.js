import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Every page as a new person and as the platform admin: console clean (no errors, no warnings) and
// no horizontal scrolling at phone, tablet and desktop widths; public legal pages; export; deletion.
const password = 'a-strong-test-password-1';
const PAGES = ['home', 'chat', 'apps', 'agents', 'knowledge', 'automations', 'models', 'integrations', 'team', 'account'];
const WIDTHS = [[360, 760], [768, 1024], [1440, 900]];
// playwright.config.js lists this address in ADMIN_EMAILS for the API under test.
const ADMIN = process.env.E2E_ADMIN_EMAIL;

function watch(page) {
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
  return problems;
}

async function register(page, email) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a workspace' }).click();
  await page.getByLabel('Full name').fill('Page Walker');
  await page.getByPlaceholder('Your company or team').fill('Walkers');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Skip tour' }).click();
}

async function visitAll(page, pages, problems) {
  for (const [width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    for (const p of pages) {
      await page.evaluate(r => { window.location.hash = `/${r}`; }, p);
      await expect(page.locator('main.page h1').first()).toBeVisible();
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${p} at ${width}px scrolls sideways by ${overflow}px`);
    }
  }
}

test('public pages render without console noise', async ({ page }) => {
  const problems = watch(page);
  for (const [path, title] of [['/', 'Welcome back'], ['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/acceptable-use', 'Acceptable use']]) {
    for (const [width, height] of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await expect(page.getByRole('heading', { name: new RegExp(title, 'i') }).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${path} at ${width}px scrolls sideways by ${overflow}px`);
    }
  }
  expect(problems).toEqual([]);
});

test('every page for a new member, then export and delete the account', async ({ page }) => {
  const problems = watch(page);
  await register(page, `walker-${Date.now()}@example.com`);
  await visitAll(page, PAGES, problems);
  // A non-admin opening the platform console lands on Home instead of a wall of errors.
  await page.evaluate(() => { window.location.hash = '/admin'; });
  await expect(page.getByRole('heading', { name: 'Platform admin' })).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { window.location.hash = '/account'; });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const file = await download;
  const data = JSON.parse(readFileSync(await file.path(), 'utf8'));
  expect(data.format).toBe('galdus-account-export/2');
  expect(data.user.full_name).toBe('Page Walker');

  page.once('dialog', d => d.accept());
  await page.locator('.danger-zone input').fill(password);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('the platform admin sees the console and the setup guides', async ({ page }) => {
  const problems = watch(page);
  // Outside production a listed address is admin from registration (production waits for email confirmation).
  await register(page, ADMIN);
  await expect(page.locator('nav').getByText('Platform admin')).toBeVisible();
  await visitAll(page, ['admin'], problems);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('tab', { name: 'Setup' }).click();
  await expect(page.getByText(/of \d+ ready/)).toBeVisible();
  await page.getByRole('button', { name: /Sign in with Microsoft/ }).click();
  await expect(page.getByText('/api/v1/auth/oauth/microsoft/callback')).toBeVisible();
  expect(problems).toEqual([]);
});
