// Verifie la demo en file:// dans Edge. Lancer : node tests/demo.mjs <demo.html> <capture.png>
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const require = createRequire(process.env.PLAYWRIGHT_CORE + '/');
const { chromium } = require('playwright-core');
const [file, shot] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 950 }, acceptDownloads: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
try {
  await page.goto(pathToFileURL(file).href);
  await page.waitForTimeout(800);
  assert.deepEqual(errors, []);
  assert.equal(await page.locator('#rows tr[data-id]').count(), 16);
  assert.match(await page.textContent('#stats'), /anneaux posés/);
  const box = await page.locator('#map').boundingBox();
  await page.click('[data-tool="leak"]');
  await page.mouse.click(box.x + 300, box.y + 200);
  await page.waitForFunction(() => document.querySelectorAll('#rows tr[data-id]').length === 17);
  await page.selectOption('#lang', 'en');
  await page.selectOption('#unit', 'm');
  await page.waitForFunction(() => document.querySelector('#stats').textContent.includes('rings built'));
  await page.selectOption('#lang', 'fr');
  await page.selectOption('#unit', 'ft');
  await page.waitForTimeout(150);
  const [xl] = await Promise.all([page.waitForEvent('download'), page.click('#bExcel')]);
  assert.match(xl.suggestedFilename(), /\.xlsx$/);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: shot });
  assert.deepEqual(errors, []);
  console.log('DEMO OK');
} finally {
  await browser.close();
}
