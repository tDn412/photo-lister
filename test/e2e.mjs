import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ExcelJS from 'exceljs';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const port = Number(process.env.E2E_PORT) || 4185;
const base = `http://127.0.0.1:${port}`;
const screenshots = path.join(root, 'screenshots');
const output = path.join(root, 'test-output');
fs.mkdirSync(screenshots, { recursive: true });
fs.mkdirSync(output, { recursive: true });

const chromiumCandidates = [
  process.env.CHROMIUM_PATH,
  '/snap/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);
const playwrightChromium = chromium.executablePath();
const launchOptions = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
if (!fs.existsSync(playwrightChromium)) {
  const fallback = chromiumCandidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(fallback, 'Run `npx playwright-core install chromium` (or set CHROMIUM_PATH) for the e2e test');
  launchOptions.executablePath = fallback;
}

const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});

let browser;

// Documentation screenshots should show steady state, not transient toasts.
async function snap(page, name) {
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((toast) => toast.remove()));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(screenshots, name) });
}
try {
  await waitForServer();
  browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
  });

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await snap(page, '01-empty.png');
  assert.equal(await page.locator('.thumb').count(), 0);
  assert.equal(await page.isDisabled('#btn-export'), true);

  // Load the demo batch.
  await page.click('#btn-demo-empty');
  await page.waitForFunction(() => document.querySelectorAll('.thumb').length === 10);
  await page.waitForTimeout(900);
  assert.equal(await page.locator('.thumb').count(), 10);
  assert.equal(await page.inputValue('#f-name'), 'iPhone 13 Pro 256GB');
  assert.equal(await page.inputValue('#f-price'), '8500000');
  assert.match(await page.textContent('#price-hint'), /8\.500\.000/);
  assert.match(await page.textContent('#suggest-meta'), /iPhone 13 Pro detected/);
  assert.equal(await page.isVisible('#suggest-card'), true);
  await snap(page, '02-review.png');

  // Edit the first item and use Enter to advance.
  await page.fill('#f-name', 'iPhone 13 Pro 256GB');
  await page.fill('#f-price', '8tr5');
  await page.fill('#f-notes', 'Pin 89%, full box, tiny scratch on frame.');
  await page.selectOption('#f-condition', 'used');
  assert.match(await page.textContent('#price-hint'), /8\.500\.000/);
  await page.press('#f-price', 'Enter');
  await page.waitForFunction(() => document.querySelector('#file-index').textContent.startsWith('2 /'));
  assert.match(await page.textContent('#progress-text'), /1 \/ 10 ready/);
  assert.equal(await page.locator('.thumb').nth(0).evaluate((el) => el.classList.contains('is-done')), true);

  // Shift+Enter goes back and preserves the draft.
  await page.press('#f-price', 'Shift+Enter');
  await page.waitForFunction(() => document.querySelector('#file-index').textContent.startsWith('1 /'));
  assert.equal(await page.inputValue('#f-name'), 'iPhone 13 Pro 256GB');
  assert.equal(await page.inputValue('#f-price'), '8tr5');
  assert.equal(await page.inputValue('#f-notes'), 'Pin 89%, full box, tiny scratch on frame.');

  // Image polishing tab: enable overlay and confirm the processed preview.
  await page.click('.tab[data-tab="image"]');
  await page.waitForTimeout(250);
  await page.check('#s-overlay');
  await page.waitForTimeout(500);
  const processedSrc = await page.getAttribute('#preview-img', 'src');
  assert.ok(processedSrc?.startsWith('data:image/jpeg'), 'processed preview should be a canvas export');
  await snap(page, '03-image-tools.png');
  await page.click('#view-toggle button[data-view="original"]');
  await page.waitForTimeout(250);
  const originalSrc = await page.getAttribute('#preview-img', 'src');
  assert.ok(originalSrc?.startsWith('blob:'), 'original preview should use the local file URL');
  await page.click('#view-toggle button[data-view="processed"]');
  await page.waitForTimeout(400);

  // Settings dialog opens and closes without disturbing the batch.
  await page.click('#btn-settings');
  await page.waitForSelector('#settings-dialog[open]');
  await snap(page, '04-settings.png');
  assert.equal(await page.inputValue('#s-api-model'), 'gpt-4o-mini');
  await page.click('#btn-save-settings');
  await page.waitForFunction(() => !document.querySelector('#settings-dialog').open);

  // Skip photo 2, then mark the rest ready with the keyboard.
  await page.locator('.thumb').nth(1).click();
  await page.waitForFunction(() => document.querySelector('#file-index').textContent.startsWith('2 /'));
  await page.click('#btn-skip');
  await page.waitForFunction(() => document.querySelector('#file-index').textContent.startsWith('3 /'));
  assert.equal(await page.locator('.thumb').nth(1).evaluate((el) => el.classList.contains('is-skipped')), true);

  for (let i = 0; i < 8; i++) {
    await page.click('#btn-next');
    await page.waitForTimeout(120);
  }
  await page.waitForFunction(() => document.querySelector('#progress-text').textContent.includes('9 / 10'));
  assert.match(await page.textContent('#progress-text'), /9 \/ 10 ready/);
  await snap(page, '05-complete.png');

  // The post list is the primary output: clean photos + copyable captions.
  await page.click('#nav-list');
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 9);
  await page.waitForFunction(
    () => document.querySelector('.post-card .post-img')?.src.startsWith('data:image/jpeg'),
    null,
    { timeout: 20_000 }
  );
  assert.equal(await page.locator('.post-card').count(), 9);
  assert.match(await page.locator('.post-card .post-name').first().textContent(), /iPhone 13 Pro 256GB/);
  assert.match(await page.locator('.post-card .post-price').first().textContent(), /8\.500\.000/);
  assert.equal(await page.locator('.post-badge.is-ready').count(), 9);
  assert.equal(
    await page.locator('.post-card .post-img').first().getAttribute('src').then((src) => src.startsWith('data:image/jpeg')),
    true
  );
  await snap(page, '10-post-list.png');

  const firstCard = page.locator('.post-card').first();
  await firstCard.locator('[data-action="copy-caption"]').click();
  await page.waitForFunction(() => document.querySelector('.post-card [data-action="copy-caption"]').classList.contains('is-copied'));
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clipboardText, /^iPhone 13 Pro 256GB/);
  assert.match(clipboardText, /8\.500\.000 ₫/);
  assert.match(clipboardText, /Pin 89%/);

  await firstCard.locator('[data-action="copy-photo"]').click();
  await page.waitForFunction(() => document.querySelector('.post-card [data-action="copy-photo"]').classList.contains('is-copied'), {
    timeout: 30_000,
  });
  const clipboardTypes = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return items.flatMap((item) => item.types);
  });
  assert.ok(clipboardTypes.includes('image/png'), `clipboard should hold a PNG: ${clipboardTypes.join(', ')}`);

  await page.click('#nav-review');
  await page.waitForFunction(() => document.querySelector('#listing').hidden === true);

  // Export is still available as an optional spreadsheet.
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.click('#btn-export');
  const download = await downloadPromise;
  const downloadPath = path.join(output, 'e2e-export.xlsx');
  await download.saveAs(downloadPath);
  await page.waitForFunction(() => document.querySelector('#busy-overlay').hidden === true, { timeout: 60_000 });
  const successToast = await page.locator('.toast.success').last().textContent();
  assert.match(successToast, /Exported 9 products/);
  assert.match(successToast, /1 skipped photo was left out/);
  assert.ok(fs.statSync(downloadPath).size > 60_000, 'downloaded xlsx should contain thumbnails');
  await snap(page, '06-exported.png');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(downloadPath);
  const sheet = workbook.getWorksheet('Products');
  assert.equal(sheet.rowCount, 10, 'header + 9 exported products');
  assert.equal(sheet.getCell('B2').value, 'iPhone 13 Pro 256GB');
  assert.equal(sheet.getCell('C2').value, 8_500_000);
  assert.equal(sheet.getCell('D2').value, 'Used');
  assert.match(sheet.getCell('E2').value, /Pin 89%/);
  const imageCount = workbook.model.media?.length || 0;
  assert.equal(imageCount, 9, 'every exported row should have an embedded thumbnail');
  const listing = execFileSync('unzip', ['-l', downloadPath], { encoding: 'utf8' });
  assert.match(listing, /xl\/media\/image9\.jpeg/);

  // Reloading loses photos (privacy) but restores draft text for re-added files.
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('.thumb').count(), 0);
  await page.click('#btn-demo-empty');
  await page.waitForFunction(() => document.querySelectorAll('.thumb').length === 10);
  await page.waitForTimeout(500);
  assert.equal(await page.inputValue('#f-name'), 'iPhone 13 Pro 256GB');
  assert.equal(await page.inputValue('#f-price'), '8tr5');
  assert.equal(await page.inputValue('#f-notes'), 'Pin 89%, full box, tiny scratch on frame.');
  assert.match(await page.textContent('#progress-text'), /9 \/ 10 ready/);
  await snap(page, '07-draft-restored.png');

  assert.deepEqual(errors, [], `browser errors: ${errors.join('\n')}`);
  console.log('E2E passed');
  console.log(`  workbook: ${downloadPath} (${(fs.statSync(downloadPath).size / 1024).toFixed(0)} KB, ${imageCount} images)`);
  console.log(`  screenshots: ${screenshots}`);
} finally {
  await browser?.close().catch(() => {});
  server.kill('SIGTERM');
}

async function waitForServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Server did not start on ${base}`);
}
