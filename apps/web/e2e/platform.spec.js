import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

// One person walks the whole product, in order: the steps share the account created first.
test.describe.configure({ mode: 'serial' });

const email = `e2e-${Date.now()}@example.com`;
const password = 'a-strong-test-password-1';
let page;
let secret = '';

function totp(b32, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of b32.replace(/=+$/, '')) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('pageerror', e => { throw e; });
});
test.afterAll(async () => { await page.close(); });

const nav = async name => { await page.locator('nav').getByText(name, { exact: true }).click(); };

test('register a workspace', async () => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a workspace' }).click();
  await page.getByLabel('Full name').fill('E2E Owner');
  await page.getByPlaceholder('Your company or team').fill('E2E SpA');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByText('Set up your workspace')).toBeVisible();
});

test('first-run tour: walk through every step and finish', async () => {
  const tour = page.getByRole('dialog', { name: 'Welcome to Galdus' });
  await expect(tour).toBeVisible();
  const titles = ['Connect a model', 'Chat', 'Knowledge', 'Agents', 'Automations', 'Account and security'];
  for (const title of titles) {
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page.getByRole('dialog', { name: title })).toBeVisible();
  }
  await expect(page.getByText('Step 7 of 7')).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Saved on the account: a reload does not bring it back.
  await page.reload();
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.locator('.tour-panel')).toHaveCount(0);
  await nav('Home');
});

test('connect a model with the wizard', async () => {
  await nav('Models');
  await page.locator('.prov-card', { hasText: 'OpenAI-compatible' }).click();
  await page.getByRole('button', { name: /I have my/ }).click();
  await page.locator('.wz-form input[type=url]').fill('http://127.0.0.1:9002/v1');
  await page.locator('.wz-form .gs-combo input').fill('demo-llm');
  await page.getByRole('button', { name: 'Test and connect' }).click();
  await expect(page.locator('.wz-done')).toBeVisible();
  await page.getByRole('button', { name: /Use demo-llm/ }).click();
  await expect(page.locator('.conn-tile')).toHaveCount(1);
});

test('chat streams an answer', async () => {
  await nav('Chat');
  await page.locator('#prompt').fill('Ciao, funziona?');
  await page.keyboard.press('Enter');
  await expect(page.locator('.msg.assistant').last()).toContainText('tutto funziona');
});

test('knowledge: upload and search', async () => {
  await nav('Knowledge');
  await page.getByPlaceholder('IT runbooks').fill('Runbook');
  await page.getByRole('button', { name: 'Create collection' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.md', mimeType: 'text/markdown', buffer: Buffer.from('# Backup\n\nIl backup notturno parte alle 02:00.') });
  await expect(page.locator('td', { hasText: 'backup.md' })).toBeVisible();
  await page.getByPlaceholder('Ask something your documents answer').fill('backup notturno');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('02:00')).toBeVisible();
});

test('agents: create and run', async () => {
  await nav('Agents');
  await page.getByRole('button', { name: 'New agent' }).click();
  await page.getByPlaceholder('Service desk assistant').fill('Helpdesk');
  await page.locator('textarea').first().fill('Rispondi in italiano.');
  await page.locator('form').getByRole('button', { name: /Create agent|Save/ }).click();
  await expect(page.getByText('Agent created.')).toBeVisible();
  await page.locator('textarea').last().fill('Il backup è fallito');
  await page.getByRole('button', { name: 'Run agent' }).click();
  await expect(page.getByText('Succeeded').first()).toBeVisible();
});

test('automation wizard and run now', async () => {
  await nav('Automations');
  await page.getByRole('button', { name: /New automation|Create your first automation/ }).first().click();
  await page.locator('.wz input[placeholder^="Monday"]').fill('Daily digest');
  await page.locator('.wz textarea').fill('Riassumi le novità');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('.choice', { hasText: 'When called' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create automation' }).click();
  await expect(page.locator('.copyfield code')).toContainText('/api/v1/hooks/');
  await page.getByRole('button', { name: 'Try it now' }).click();
  await expect(page.locator('.wz-ok')).toContainText('It worked');
  await page.locator('.wz-foot').getByRole('button', { name: 'Done' }).click();
});

test('team: invite a teammate', async () => {
  await nav('Team');
  await page.getByPlaceholder('name@company.com').fill('teammate@example.com');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  await expect(page.getByText('Send this link to your teammate')).toBeVisible();
});

test('turn on two-step verification and sign in with it', async () => {
  await nav('Account');
  await page.getByRole('button', { name: 'Turn on' }).click();
  await page.locator('.wz-foot').getByRole('button', { name: 'Start' }).click();
  secret = (await page.locator('.mfa-key').innerText()).replace(/\s/g, '');
  await page.getByRole('button', { name: /I scanned it/ }).click();
  await page.locator('.otp.big').fill(totp(secret));
  await page.locator('.wz-foot').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('.recovery li')).toHaveCount(10);
  await page.locator('.wz label.check input').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('.wz-foot').getByRole('button', { name: 'Done' }).click();

  await page.locator('.sidebar-foot').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Create a workspace' })).toBeVisible();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('input.otp')).toBeVisible();
  // A code is accepted once per 30-second step: wait for the next one.
  await page.waitForTimeout(31_000);
  await page.locator('input.otp').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.locator('.user-chip')).toBeVisible();
});
