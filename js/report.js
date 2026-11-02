// Rapports : carte developpee imprimable en PDF et classeur Excel.
import { clock, crackLength } from './geometry.js';
import { TYPES } from './config.js';
import { LIGHT, drawStrip } from './draw.js';
import { lenNumber, lenText, t as tr, unitName } from './i18n.js';
import { store } from './store.js';

const RINGS_PER_STRIP = 100;
const STRIP_W = 1800;
const STRIP_H = 420;
const AXIS = 76;

export const ringSpan = (f) => {
  const rs = f.pts.map((p) => Math.floor(p.r));
  return [Math.min(...rs), Math.max(...rs)];
};

export function defectRow(f, t) {
  const [a, b] = ringSpan(f);
  const ring = t.rings.get(a);
  const p = f.pts[0];
  const ft = f.type === 'crack' ? crackLength(f.pts, t.layout, t.geo.circ) : null;
  return {
    id: f.id.slice(0, 8),
    rings: a === b ? String(a) : a + '–' + b,
    station: t.station(a),
    segment: ring ? t.geo.segAt(ring.key, p.d) : '',
    position: clock(p.d),
    type: tr('tool.' + f.type),
    severity: tr('sev.' + f.g),
    lengthText: ft == null ? null : lenText(ft),
    length: ft == null ? null : lenNumber(ft),
    status: tr('st.' + f.stat),
    photos: f.photos ?? 0,
    date: f.date,
    by: f.by,
    note: f.note,
  };
}

export const sortDefects = (list) => [...list].sort((x, y) => x.pts[0].r - y.pts[0].r);

function stripImage(t, fromRing, toRing) {
  const canvas = document.createElement('canvas');
  canvas.width = STRIP_W;
  canvas.height = STRIP_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = LIGHT.bg;
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);
  const fromFt = t.layout.start[fromRing];
  const toFt = t.layout.start[toRing + 1];
  const scale = (STRIP_W - AXIS - 8) / (RINGS_PER_STRIP * t.layout.maxWidth);
  const top = 34;
  const H = STRIP_H - top - 6;
  ctx.fillStyle = LIGHT.fg;
  ctx.font = '500 12px Consolas, monospace';
  ctx.textAlign = 'left';
  for (const [d, label] of [[0, 'Crown 12h'], [90, 'Spring 3h'], [180, 'Invert 6h'], [270, 'Spring 9h'], [360, 'Crown 12h']]) {
    const y = top + (d / 360) * H;
    ctx.fillText(label, 2, d === 0 ? y + 12 : d === 360 ? y - 2 : y + 4);
  }
  drawStrip(ctx, {
    layout: t.layout, rings: t.rings, defects: t.defects, geo: t.geo, typeOf: t.typeOf,
    fromFt, toFt, scale, x0: AXIS, top, H, c: LIGHT,
  });
  return canvas.toDataURL('image/png');
}

export async function buildReport(root, t, author) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const built = t.lastRing;
  const counts = Object.keys(TYPES)
    .map((k) => `${tr('tool.' + k)}: ${t.defects.filter((f) => f.type === k).length}`)
    .join(' · ');
  const today = new Date().toISOString().slice(0, 10);
  let html = `<header class="r-head"><h1>${esc(tr('r.title', { p: t.projectName, t: t.name }))}</h1>
    <p>${tr('r.edited', { d: today })}${author ? esc(tr('r.by', { a: author })) : ''} · ${tr('r.summary', { b: built, t: t.total, n: t.defects.length, c: counts })}</p>
    <p class="r-note">${tr('r.note', { c: lenText(t.geo.circ) })}</p></header>`;
  for (let a = 1; a <= built; a += RINGS_PER_STRIP) {
    const b = Math.min(built, a + RINGS_PER_STRIP - 1);
    html += `<figure class="r-strip"><figcaption>${esc(tr('r.strip', { a, b, s: t.station(a), e: t.station(b) }))}</figcaption><img alt="" src="${stripImage(t, a, b)}"></figure>`;
  }
  if (!built) html += `<p>${tr('r.none')}</p>`;
  const rows = sortDefects(t.defects).map((f) => defectRow(f, t));
  if (rows.length) {
    html += `<table class="r-table"><thead><tr><th>${tr('col.ring')}</th><th>${tr('col.station')}</th><th>${tr('r.seg')}</th><th>${tr('r.pos')}</th><th>${tr('col.type')}</th><th>${tr('col.severity')}</th><th>${tr('col.length')}</th><th>${tr('col.status')}</th><th>${tr('col.date')}</th><th>${tr('col.by')}</th><th>${tr('col.note')}</th></tr></thead><tbody>`
      + rows.map((r) => `<tr><td>${r.rings}</td><td>${esc(r.station)}</td><td>${esc(r.segment)}</td><td>${r.position}</td><td>${esc(r.type)}</td><td>${esc(r.severity)}</td><td>${r.lengthText ?? ''}</td><td>${esc(r.status)}</td><td>${esc(r.date)}</td><td>${esc(r.by)}</td><td>${esc(r.note)}</td></tr>`).join('')
      + '</tbody></table>';
  }
  let cards = '';
  for (const f of sortDefects(t.defects)) {
    const photos = await store.photosOf(f.id);
    if (!photos.length) continue;
    const r = defectRow(f, t);
    cards += `<article class="r-card"><h3>${esc(r.type)} · ${tr('col.ring')} ${r.rings} · ${esc(r.segment)} · ${r.position} · ${esc(r.severity)}</h3>
      <p>${esc(r.station)} · ${esc(r.status)} · ${esc(r.date)}${r.by ? ' · ' + esc(r.by) : ''}${r.note ? ' · ' + esc(r.note) : ''}</p>
      <div class="r-photos">${photos.map((p) => `<img alt="" src="${esc(p.data)}">`).join('')}</div></article>`;
  }
  if (cards) html += `<h2 class="r-sec">${tr('r.photos')}</h2>${cards}`;
  root.innerHTML = html;
}

export function exportExcel(t) {
  const X = window.XLSX;
  const u = ` (${unitName()})`;
  const defects = sortDefects(t.defects).map((f) => {
    const r = defectRow(f, t);
    return {
      [tr('x.id')]: r.id, [tr('x.tunnel')]: t.name, [tr('col.ring')]: r.rings, [tr('col.station')]: r.station,
      [tr('col.segment')]: r.segment, [tr('col.position')]: r.position, [tr('col.type')]: r.type,
      [tr('col.severity')]: r.severity, [tr('col.length') + u]: r.length, [tr('col.status')]: r.status,
      [tr('col.photos')]: r.photos,
      [tr('col.date')]: r.date, [tr('col.by')]: r.by, [tr('col.note')]: r.note,
    };
  });
  const rings = [...t.rings.values()].sort((a, b) => a.n - b.n).map((r) => {
    const label = t.layout.label(r.n);
    return {
      [tr('col.ring')]: r.n, [tr('col.station')]: t.station(r.n), [tr('x.pm')]: r.pm ?? null, [tr('col.type')]: label,
      [tr('x.material')]: tr('mat.' + t.typeOf(label).material), [tr('x.width') + u]: lenNumber(t.layout.width(r.n)),
      [tr('d.keySet')]: 'K' + r.key, [tr('d.keyOpt')]: r.opt ? 'K' + r.opt : '', [tr('d.laid')]: r.date,
      [tr('x.src')]: tr(r.source === 'rfr' ? 'src.rfr' : 'src.manual'),
      [tr('x.count')]: t.defects.filter((f) => {
        const [a, b] = ringSpan(f);
        return r.n >= a && r.n <= b;
      }).length,
    };
  });
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(defects), tr('x.defects'));
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rings), tr('x.rings'));
  X.writeFile(wb, tr('x.file', { p: t.projectName, t: t.name, d: new Date().toISOString().slice(0, 10) }));
}
