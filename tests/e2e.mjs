// Parcours complet dans Edge, profil vierge : projet, import, annotation, fusion, exports, hors-ligne.
// Lancer : PLAYWRIGHT_CORE=<chemin de playwright-core> node tests/e2e.mjs <sortie> <fichier projet> <fichier RFR>
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const require = createRequire(process.env.PLAYWRIGHT_CORE + '/');
const { chromium } = require('playwright-core');
const [out, projectFile, rfr] = process.argv.slice(2);
const PORT = '5181';
const URL_APP = `http://localhost:${PORT}/`;

const server = spawn(process.execPath, ['serve.mjs'], { env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
const statText = () => page.textContent('#stats');
const rowCount = (n, p = page) => p.waitForFunction((c) => document.querySelectorAll('#rows tr[data-id]').length === c, n);

try {
  // Premier lancement : l'ecran Projet s'ouvre, avec messages d'erreur clairs.
  await page.goto(URL_APP);
  await page.waitForSelector('#projDlg[open]');
  await page.click('#pSave');
  assert.match(await page.textContent('#pErr'), /nom/);
  await page.fill('#pName', 'Chantier test');
  await page.fill('#pSegs', 'K:60, A:60');
  await page.click('#pSave');
  assert.match(await page.textContent('#pErr'), /360/);
  await page.fill('#pSegs', 'K:90, A:90, B:90, C:90');
  await page.click('#pSave');
  await page.waitForFunction(() => document.querySelector('#title').textContent === 'Chantier test');
  assert.match(await statText(), /0 \/ 1000/);

  // Deuxieme projet par fichier.
  await page.click('#bNewProject');
  await page.setInputFiles('#pImport', projectFile);
  await page.waitForFunction(() => !document.querySelector('#projDlg').open);
  await page.waitForFunction(() => document.querySelector('#stats b').textContent.includes('/') && !document.querySelector('#stats b').textContent.includes('1000'));
  assert.equal(await page.locator('#project option').count(), 2);

  await page.setInputFiles('#rfr', rfr);
  await page.waitForFunction(() => !document.querySelector('#stats b').textContent.startsWith('0 /'));
  await page.screenshot({ path: join(out, '1-import.png') });

  const box = await page.locator('#map').boundingBox();
  await page.click('[data-tool="crack"]');
  await page.mouse.move(box.x + 500, box.y + 120);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 500 + i * 22, box.y + 120 + i * 13);
  await page.mouse.up();
  await rowCount(1);
  await page.selectOption('#dG', '3');
  await page.fill('#dN', 'Essai <script>');
  await page.locator('#dN').blur();
  await page.click('[data-tool="leak"]');
  await page.mouse.click(box.x + 650, box.y + 300);
  await rowCount(2);

  // Export des donnees, puis suppression : la fusion ne doit pas faire revenir le defaut.
  const [dl1] = await Promise.all([page.waitForEvent('download'), page.click('#bBackup')]);
  await dl1.saveAs(join(out, 'data-avant.json'));
  await page.click('#rows tr:nth-child(2) [data-act="delete"]');
  await rowCount(1);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#bBackup')]);
  await dl2.saveAs(join(out, 'data-apres.json'));
  await page.setInputFiles('#restore', join(out, 'data-avant.json'));
  await page.waitForTimeout(300);
  await rowCount(1);

  // Fusion sur un autre appareil : le projet et les donnees arrivent avec le fichier.
  const other = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const p2 = await other.newPage();
  await p2.goto(URL_APP);
  await p2.waitForSelector('#projDlg[open]');
  await p2.setInputFiles('#pImport', projectFile);
  await p2.waitForFunction(() => !document.querySelector('#projDlg').open);
  await p2.setInputFiles('#restore', join(out, 'data-avant.json'));
  await rowCount(2, p2);
  await p2.setInputFiles('#restore', join(out, 'data-apres.json'));
  await rowCount(1, p2);
  await other.close();

  // Langue, unites et rechargement.
  await page.selectOption('#lang', 'en');
  await page.selectOption('#unit', 'm');
  await page.waitForFunction(() => document.querySelector('#stats').textContent.includes('rings built'));
  await page.selectOption('#lang', 'fr');
  await page.selectOption('#unit', 'ft');
  await page.reload();
  await rowCount(1);
  assert.ok((await page.textContent('#rows')).includes('Essai <script>'));

  const [xl] = await Promise.all([page.waitForEvent('download'), page.click('#bExcel')]);
  await xl.saveAs(join(out, 'export.xlsx'));
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#bPrint');
  await page.waitForFunction(() => document.querySelectorAll('#report img').length > 0);
  await page.pdf({ path: join(out, 'rapport.pdf'), landscape: true, printBackground: true });

  // Changement de projet : chaque projet garde ses donnees.
  await page.selectOption('#project', { index: 0 });
  await page.waitForFunction(() => document.querySelector('#title').textContent === 'Chantier test');
  await rowCount(0);
  await page.selectOption('#project', { index: 1 });
  await rowCount(1);
  await page.waitForTimeout(200);

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await ctx.setOffline(true);
  await page.reload();
  await rowCount(1);
  await ctx.setOffline(false);

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  const p = await phone.newPage();
  await p.goto(URL_APP);
  await p.waitForSelector('#projDlg[open]');
  await p.setInputFiles('#pImport', projectFile);
  await p.waitForFunction(() => !document.querySelector('#projDlg').open);
  await p.waitForTimeout(200);
  const noOverflow = async () => {
    const wide = await p.evaluate(() => [...document.querySelectorAll('#app *')]
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5 && e.offsetParent && !e.closest('.scroller,.tablewrap,.tools'))
      .slice(0, 6).map((e) => `${e.tagName}#${e.id}.${e.className} ${Math.round(e.getBoundingClientRect().right)}`));
    if (wide.length) console.log('depasse :', wide);
    return p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  };

  // Telephone : ecrans separes, l'import se fait sur Donnees et la carte se place au front.
  assert.ok(await p.locator('#rfr').isVisible());
  assert.equal(await p.locator('#map').isVisible(), false);
  await p.setInputFiles('#rfr', rfr);
  await p.waitForFunction(() => document.querySelector('#toast').textContent.length > 0);
  assert.ok(await noOverflow(), 'debordement ecran donnees');
  await p.screenshot({ path: join(out, '4-tel-donnees.png') });

  await p.click('#tabs [data-screen="ring"]');
  await p.waitForTimeout(200);
  assert.ok(await p.locator('#map').isVisible());
  assert.ok(await p.evaluate(() => document.getElementById('scroller').scrollLeft > 0), 'carte placee au front');
  assert.ok(await p.evaluate(() => document.getElementById('map').width > 0));
  assert.equal(await p.locator('#rfr').isVisible(), false);
  const b = await p.locator('#map').boundingBox();
  await p.tap('[data-tool="leak"]');
  await p.touchscreen.tap(b.x + 150, b.y + 200);
  await rowCount(1, p);
  await p.waitForTimeout(500);
  assert.ok(await p.locator('#dG').isVisible(), 'fiche visible apres un releve');
  assert.ok(await noOverflow(), 'debordement ecran anneaux');
  await p.screenshot({ path: join(out, '4-tel-anneaux.png') });

  const kept = await p.evaluate(() => document.getElementById('scroller').scrollLeft);
  await p.click('#tabs [data-screen="def"]');
  await p.waitForTimeout(200);
  assert.ok(await p.locator('#rows [data-act="edit"]').isVisible());
  assert.equal(await p.locator('#map').isVisible(), false);
  assert.ok(await noOverflow(), 'debordement ecran defauts');
  await p.screenshot({ path: join(out, '4-tel-defauts.png') });
  await p.click('#rows [data-act="edit"]');
  await p.waitForTimeout(500);
  assert.ok(await p.locator('#dG').isVisible(), 'modifier ouvre la fiche');
  await p.click('#tabs [data-screen="def"]');
  await p.click('#tabs [data-screen="ring"]');
  await p.waitForTimeout(150);
  assert.ok(Math.abs(await p.evaluate(() => document.getElementById('scroller').scrollLeft) - kept) < 400, 'position conservee');

  const tablet = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  const pt = await tablet.newPage();
  await pt.goto(URL_APP);
  await pt.waitForSelector('#projDlg[open]');
  await pt.setInputFiles('#pImport', projectFile);
  await pt.waitForFunction(() => !document.querySelector('#projDlg').open);
  await pt.waitForTimeout(200);
  assert.ok(await pt.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'pas de debordement tablette');
  await pt.screenshot({ path: join(out, '5-tablette.png') });

  assert.deepEqual(errors, []);
  console.log('E2E OK');
} finally {
  await browser.close();
  server.kill();
}
