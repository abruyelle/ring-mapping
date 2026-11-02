// Un fichier d'echange piege ne doit ni executer de code, ni rendre l'app inutilisable.
// Chaque champ est essaye seul, sur un profil vierge, a cote d'un defaut sain qui prouve l'affichage.
// Lancer : PLAYWRIGHT_CORE=<chemin de playwright-core> node tests/import-safety.mjs <sortie>
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeProject } from '../js/project.js';

const require = createRequire(process.env.PLAYWRIGHT_CORE + '/');
const { chromium } = require('playwright-core');
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const PORT = '5182';

const project = normalizeProject(JSON.parse(readFileSync('tests/fixture.project.json', 'utf8')));
const tunnel = `${project.id}/${project.tunnels[0].id}`;
const now = '2099-01-01T00:00:00.000Z';
const fire = `<img src=x onerror=window.__pwn=1>`;
const defect = (id, more) => ({
  id, tunnel, type: 'leak', g: 1, stat: 'open', date: '2026-01-01', by: '', note: '', pts: [{ r: 1.5, d: 10 }], updatedAt: now, ...more,
});
const ring = (n, more) => ({ tunnel, n, key: 12, source: 'manual', date: '', updatedAt: now, ...more });
const photo = (data) => ({ id: 'ph', defect: 'sain', tunnel, data, createdAt: now, updatedAt: now });

const CASES = {
  'photo.data': { photos: [photo('x" onerror="window.__pwn=1')] },
  'defect.g': { defects: [defect('x', { g: `1">${fire}` })] },
  'defect.type': { defects: [defect('x', { type: fire })] },
  'defect.stat': { defects: [defect('x', { stat: fire })] },
  'defect.id': { defects: [defect(`x">${fire}`)] },
  'defect.by': { defects: [defect('x', { by: fire, note: fire, date: fire })] },
  'defect.pts': { defects: [defect('x', { pts: [{ r: fire, d: 0 }] })] },
  'defect.pts vide': { defects: [defect('x', { pts: [] })] },
  'defect sans id': { defects: [{ tunnel, type: 'leak' }] },
  'ring.key': { rings: [ring(2, { key: fire })] },
  'ring.opt': { rings: [ring(2, { opt: fire })] },
  'ring.n': { rings: [ring(`2${fire}`)] },
  'meta.lang': { meta: [{ k: 'lang', v: fire }] },
  'meta.autre': { meta: [{ k: `project-${project.id}`, v: fire }] },
  'autre tunnel': { defects: [defect('x', { tunnel: 'autre-projet/T1' })] },
};

const server = spawn(process.execPath, ['serve.mjs'], { env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let bad = 0;

for (const [name, extra] of Object.entries(CASES)) {
  const file = join(out, 'piege.json');
  writeFileSync(file, JSON.stringify({
    app: 'ring-mapping', project, meta: [],
    ...extra,
    rings: [ring(1), ...(extra.rings ?? [])],
    defects: [defect('sain'), ...(extra.defects ?? [])],
    photos: extra.photos ?? [],
  }));
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('#projDlg[open]');
  await page.setInputFiles('#pImport', 'tests/fixture.project.json');
  await page.waitForFunction(() => !document.querySelector('#projDlg').open);
  await page.setInputFiles('#restore', file);
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForTimeout(500);
  const rows = await page.locator('#rows tr[data-id]').count();
  for (const row of await page.locator('#rows tr[data-id]').all()) {
    await row.click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(200);
  const ran = await page.evaluate(() => !!window.__pwn);
  const alive = rows >= 1 && !!(await page.textContent('#stats').catch(() => ''))?.trim();
  const state = ran ? 'CODE EXECUTE' : alive ? 'ok' : 'APP CASSEE';
  if (state !== 'ok') bad++;
  console.log(`${state.padEnd(13)} ${name} (${rows} lignes)`);
  await ctx.close();
}

await browser.close();
server.kill();
console.log(bad ? `${bad} CAS EN ECHEC` : 'IMPORT OK');
process.exit(bad ? 1 : 0);
