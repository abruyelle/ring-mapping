// Assemble une demo en un seul fichier HTML, a ouvrir d'un double-clic (sans serveur).
// Lancer : node tools/build-demo.mjs <fichier projet> <fichier RFR> <fichier de sortie>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mergeRFR, parseRFR } from '../js/rfr.js';
import { normalizeProject } from '../js/project.js';

const [projectPath, rfrPath, out] = process.argv.slice(2);
const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const inlineSafe = (s) => s.replace(/<\/script/gi, '<\\/script');

const MODULES = ['js/geometry.js', 'js/i18n.js', 'js/config.js', 'js/rfr.js', 'js/project.js', 'tools/demo-store.js', 'js/draw.js', 'js/report.js', 'js/app.js'];
const names = [];
const bodies = MODULES.map((file) => {
  let src = read(file);
  const alias = /\bt as tr\b/.test(src) ? 'const tr = t;\n' : '';
  src = src.replace(/^import [\s\S]*?;\r?$/gm, '');
  src = src.replace(/^export const (\w+) =/gm, (_, n) => { names.push(n); return n + ' ='; });
  src = src.replace(/^export function (\w+)/gm, (_, n) => { names.push(n); return `${n} = function ${n}`; });
  src = src.replace(/^export class (\w+)/gm, (_, n) => { names.push(n); return `${n} = class ${n}`; });
  return `{ // ${file}\n${alias}${src}\n}`;
});

const project = normalizeProject(JSON.parse(readFileSync(projectPath, 'utf8')));
const parsed = parseRFR(readFileSync(rfrPath, 'utf8'), project.rfr, project.keyPositions);
const key = project.id + '/' + project.tunnels[0].id;
const rings = mergeRFR([], parsed, key, '2026-10-30T00:00:00Z').rings;

const banner = `<div class="demo">Démonstration : anneaux réels, défauts fictifs, rien n'est enregistré. Demo: real rings, sample defects, nothing is saved.</div>`;
const html = read('index.html')
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\r?\n/, '') // la demo est tout en ligne
  .replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\r?\n/g, '')
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>${read('styles.css')}\n.demo{background:#FFF1E8;border:1px solid var(--accent);border-radius:4px;padding:7px 12px;font-weight:600}</style>`)
  .replace('<script src="lib/xlsx.mini.min.js" defer></script>', () => `<script src="data:text/javascript;base64,${readFileSync(join(root, 'lib/xlsx.mini.min.js')).toString('base64')}"></script>`)
  .replace(/<script type="module" src="js\/app\.js"><\/script>\r?\n/, '')
  .replace('<div class="wrap" id="app">', () => `<div class="wrap" id="app">\n${banner}`)
  .replace('</body>', () => `<script>
window.__DEMO_PROJECT__ = ${inlineSafe(JSON.stringify(project))};
window.__DEMO_RINGS__ = ${inlineSafe(JSON.stringify(rings))};
let ${[...new Set(names)].join(', ')};
${inlineSafe(bodies.join('\n'))}
</script>\n</body>`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out} : ${(html.length / 1024).toFixed(0)} Ko, ${rings.length} anneaux`);
