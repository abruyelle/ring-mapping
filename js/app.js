import { AxisPath, Layout, clock, crackLength, makeGeometry, toFt } from './geometry.js';
import { LEGACY_STATUS, STATUS, TYPES } from './config.js';
import { mergeRFR, parseRFR, stationFt } from './rfr.js';
import { store } from './store.js';
import { drawStrip } from './draw.js';
import { applyI18n, lenText, prefs, stationText, t as tr } from './i18n.js';
import { buildReport, defectRow, exportExcel, ringSpan, sortDefects } from './report.js';
import { Ring3D, Tunnel3D } from './view3d.js';
import { compressImage } from './photos.js';
import {
  FORMAT, TEMPLATE, normalizeProject, parseSegments, parseTunnels, parseTypes, segmentsText, tunnelsText, typesText,
} from './project.js';

const APP_VERSION = 'v12'; // garder en phase avec VERSION dans sw.js
const AXIS = 76;
const TOP = 34;
const MAP_H = 400;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const message = (err) => (String(err.message).includes('.') && !err.message.includes(' ') ? tr(err.message) : err.message);

const S = { tool: 'view', ringSel: null, sel: null, seg: null, scale: 4, draft: null, author: '', moving: null, screen: 'ring', scrollX: 0, front: false };
let PROJECTS = [];
let P = null; // projet courant
let T = null; // tunnel courant
let R3 = null; // vue 3D, creee a la premiere ouverture
let TUN = null; // tunnel 3D, cree a la premiere ouverture

function tunnelState(project, cfg, rings, defects, offsetM) {
  const geo = makeGeometry(project);
  const types = project.ringTypes;
  const widest = Math.max(...Object.values(types).map((x) => x.width));
  const typeOf = (label) => ({ ...types[label], narrow: types[label].width < widest });
  const widthOf = (label) => toFt(types[label].width, project.unit);
  return {
    ...cfg,
    axis: project.axis && cfg.axisStart !== undefined ? { path: new AxisPath(project.axis), dir: cfg.axisDir } : null,
    key: project.id + '/' + cfg.id,
    projectName: project.name,
    geo,
    typeOf,
    layout: new Layout(cfg.plan, cfg.total, widthOf),
    rings: new Map(rings.map((r) => [r.n, r])),
    defects,
    offsetM: offsetM ?? cfg.offsetM,
    get lastRing() {
      return this.rings.size ? Math.max(...this.rings.keys()) : 0;
    },
    station(n) {
      const r = this.rings.get(n);
      if (r?.pm != null && this.offsetM != null) return stationText(stationFt(r.pm, this.offsetM));
      const ref = [...this.rings.values()].find((q) => q.pm != null);
      if (ref && this.offsetM != null) {
        return stationText(stationFt(ref.pm, this.offsetM) + this.layout.start[n] - this.layout.start[ref.n]);
      }
      return '–';
    },
  };
}

async function loadProject(id) {
  P = PROJECTS.find((p) => p.id === id) ?? PROJECTS[0];
  await store.setMeta('project', P.id);
  $('title').textContent = P.name;
  $('project').innerHTML = PROJECTS.map((p) => `<option value="${esc(p.id)}"${p.id === P.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  $('tunnels').innerHTML = P.tunnels.map((t) => `<button class="btn" type="button" data-t="${esc(t.id)}">${esc(t.name)}</button>`).join('');
  const saved = await store.getMeta('tunnel-' + P.id);
  await loadTunnel(P.tunnels.some((t) => t.id === saved) ? saved : P.tunnels[0].id);
}

async function loadTunnel(id) {
  const cfg = P.tunnels.find((t) => t.id === id);
  const key = P.id + '/' + id;
  const defects = (await store.defects(key)).filter((f) => !f.deleted);
  defects.forEach((f) => (f.stat = LEGACY_STATUS[f.stat] ?? f.stat));
  T = tunnelState(P, cfg, await store.rings(key), defects, await store.getMeta('offset-' + key));
  S.ringSel = null;
  S.sel = null;
  S.moving = null;
  await store.setMeta('tunnel-' + P.id, id);
  document.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === id));
  resize();
  refresh();
  goToFront();
  if (S.tun) buildTunnel();
}

// --- Carte ---------------------------------------------------------------
const canvas = $('map');
const scroller = $('scroller');
const spacer = $('spacer');
let raf = 0;

function palette() {
  const s = getComputedStyle(document.documentElement);
  const v = (n) => s.getPropertyValue(n).trim();
  return {
    bg: v('--surface'), fg: v('--fg'), muted: v('--muted'), line: v('--line'), accent: v('--accent'),
    seg: v('--seg'), segB: v('--seg-b'), segLine: v('--seg-line'), ghost: v('--ghost'),
    crack: v('--crack'), zone: v('--zone'), leak: v('--leak'), spall: v('--spall'), lip: v('--lip'), other: v('--other'),
    typeA: v('--type-a'), typeB: v('--type-b'), typeU: v('--line'),
  };
}
const colors = palette();

function resize() {
  if (!T) return;
  const w = scroller.clientWidth;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = w + 'px';
  canvas.style.height = TOP + MAP_H + 6 + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round((TOP + MAP_H + 6) * dpr);
  spacer.style.width = T.layout.length * S.scale + AXIS + 'px';
  draw();
}

function draw() {
  if (S.v3d) R3.invalidate();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(render);
}

function render() {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, canvas.height / dpr);
  const fromFt = scroller.scrollLeft / S.scale;
  drawStrip(ctx, {
    layout: T.layout, rings: T.rings, defects: T.defects, geo: T.geo, typeOf: T.typeOf,
    fromFt, toFt: fromFt + (w - AXIS) / S.scale, scale: S.scale, x0: AXIS, top: TOP, H: MAP_H, c: colors,
    selRing: S.ringSel, selId: S.sel, draft: S.draft,
  });
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, AXIS, TOP + MAP_H + 6);
  ctx.font = '500 11px Consolas, monospace';
  ctx.textAlign = 'left';
  const [left, right] = prefs.lang === 'fr' ? ['Spring G', 'Spring D'] : ['Spring L', 'Spring R'];
  const rows = [[-180, 'Invert', '6h'], [-90, left, '9h'], [0, 'Crown', '12h'], [90, right, '3h'], [180, 'Invert', '6h']];
  rows.forEach(([d, a, b], i) => {
    const y = TOP + ((d + 180) / 360) * MAP_H + (i === 0 ? 12 : i === 4 ? -16 : 0);
    ctx.fillStyle = colors.fg;
    ctx.fillText(a, 6, y);
    ctx.fillStyle = colors.muted;
    ctx.fillText(b, 6, y + 13);
  });
}

function pos(e) {
  const b = canvas.getBoundingClientRect();
  const ft = (e.clientX - b.left - AXIS + scroller.scrollLeft) / S.scale;
  return {
    r: T.layout.rOf(Math.max(0, Math.min(T.layout.length - 0.001, ft))),
    d: Math.max(-180, Math.min(180, ((e.clientY - b.top - TOP) / MAP_H) * 360 - 180)),
  };
}

function pick(e) {
  const b = canvas.getBoundingClientRect();
  const px = e.clientX - b.left;
  const py = e.clientY - b.top;
  const sx = (p) => AXIS + T.layout.ftOf(p.r) * S.scale - scroller.scrollLeft;
  const sy = (p) => TOP + ((p.d + 180) / 360) * MAP_H;
  let best = null;
  let bestD = 14;
  for (const f of T.defects) {
    for (let i = 0; i < f.pts.length; i++) {
      const p = f.pts[i];
      let dist = Math.hypot(sx(p) - px, sy(p) - py);
      const q = f.pts[i + 1];
      if (q) {
        const [ax, ay, bx, by] = [sx(p), sy(p), sx(q), sy(q)];
        const l = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
        const u = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l));
        dist = Math.hypot(ax + u * (bx - ax) - px, ay + u * (by - ay) - py);
      }
      if (dist < bestD) {
        bestD = dist;
        best = f;
      }
    }
  }
  return best;
}

const isBuilt = (p) => T.rings.has(Math.floor(p.r));

async function saveDefect(f) {
  f.updatedAt = new Date().toISOString();
  await store.saveDefect(f);
}

// Apres un releve on revient en consultation, pour pouvoir toucher les defauts sur la carte.
async function placeDefect(type, pts) {
  const moving = T.defects.find((f) => f.id === S.moving);
  if (moving) {
    moving.pts = pts;
    await saveDefect(moving);
    S.moving = null;
    S.sel = moving.id;
    say(tr('msg.moved'));
  } else {
    const f = {
      id: crypto.randomUUID(), tunnel: T.key, type, pts, g: 1, stat: STATUS[0],
      date: today(), by: S.author, note: '',
    };
    await saveDefect(f);
    T.defects.push(f);
    S.sel = f.id;
    say(tr('msg.saved', { type: tr('tool.' + type) }));
    await attachFrozenPhoto(f);
  }
  S.ringSel = Math.floor(pts[0].r);
  setTool('view');
  refresh();
  showDetail();
}

canvas.addEventListener('pointerdown', (e) => {
  if (S.tool === 'view') return;
  const p = pos(e);
  if (!isBuilt(p)) return say(tr('msg.notLaid'));
  e.preventDefault();
  if (TYPES[S.tool].line) {
    S.draft = [p];
    canvas.setPointerCapture(e.pointerId);
  } else placeDefect(S.tool, [p]);
});
canvas.addEventListener('pointermove', (e) => {
  if (!S.draft) return;
  S.draft.push(pos(e));
  draw();
});
function finishDraft() {
  const d = S.draft;
  S.draft = null;
  R3?.setDraft(null);
  draw();
  if (crackLength(d, T.layout, T.geo.circ) < 0.5) return say(tr('msg.tooShort'));
  placeDefect(S.tool, d.filter((_, i) => i % 2 === 0 || i === d.length - 1));
}
canvas.addEventListener('pointerup', () => {
  if (S.draft) finishDraft();
});
canvas.addEventListener('pointercancel', () => {
  S.draft = null;
  draw();
});
canvas.addEventListener('click', (e) => {
  if (S.tool !== 'view') return;
  const f = pick(e);
  if (f) {
    S.sel = f.id;
    S.ringSel = ringSpan(f)[0];
  } else {
    const n = Math.floor(pos(e).r);
    S.sel = null;
    S.ringSel = T.rings.has(n) ? n : null;
  }
  draw();
  detail();
  table();
  if (f) showDetail();
});
scroller.addEventListener('scroll', draw, { passive: true });

function centerRing(n) {
  scroller.scrollLeft = T.layout.start[n] * S.scale - (scroller.clientWidth - AXIS) / 2;
  draw();
}

function goToFront() {
  // Carte cachee sur un autre ecran : on se placera au front quand elle reviendra.
  if (!scroller.clientWidth) {
    S.front = true;
    return;
  }
  if (T.lastRing) scroller.scrollLeft = T.layout.start[T.lastRing + 1] * S.scale - (scroller.clientWidth - AXIS) * 0.75;
  else scroller.scrollLeft = 0;
  draw();
}

// --- Panneaux ------------------------------------------------------------
function stats() {
  const open = T.defects.filter((f) => f.stat !== 'closed').length;
  const ft = T.defects.filter((f) => f.type === 'crack').reduce((s, f) => s + crackLength(f.pts, T.layout, T.geo.circ), 0);
  const last = T.lastRing;
  $('stats').innerHTML = `<div><b>${T.rings.size} / ${T.total}</b><span>${tr('stat.rings')}</span></div>
    <div><b>${last ? T.station(last) : '–'}</b><span>${tr('stat.front')}</span></div>
    <div><b>${open}</b><span>${tr('stat.open')}</span></div>
    <div><b>${lenText(ft)}</b><span>${tr('stat.cracks')}</span></div>`;
}

function keyOptions(v) {
  return Array.from({ length: P.keyPositions }, (_, i) => i + 1)
    .map((k) => `<option value="${k}"${k === v ? ' selected' : ''}>K${k}</option>`).join('');
}

function ringDetail(r) {
  const label = T.layout.label(r.n);
  const n = T.defects.filter((f) => {
    const [a, b] = ringSpan(f);
    return r.n >= a && r.n <= b;
  }).length;
  return `<h2>${tr('d.ring')} ${r.n}</h2>
    <dl class="kv"><dt>${tr('col.station')}</dt><dd>${T.station(r.n)}</dd>
    <dt>${tr('col.type')}</dt><dd>${esc(label)}, ${tr('mat.' + T.typeOf(label).material)}, ${lenText(T.layout.width(r.n))}</dd>
    <dt>${tr('d.keySet')}</dt><dd>K${r.key}</dd>${r.opt && r.opt !== r.key ? `<dt>${tr('d.keyOpt')}</dt><dd>K${r.opt}</dd>` : ''}
    <dt>${tr('d.laid')}</dt><dd>${esc(r.date) || '–'}</dd><dt>${tr('d.source')}</dt><dd>${tr(r.source === 'rfr' ? 'src.rfr' : 'src.manual')}</dd>
    <dt>${tr('d.defects')}</dt><dd>${n}</dd></dl>
    ${S.v3d ? '' : `<button class="btn primary" id="d3d" type="button">${tr('d.view3d')}</button>`}
    ${r.source === 'rfr' ? '' : `<label class="f">${tr('d.fixKey')} <select id="rK">${keyOptions(r.key)}</select></label>`}`;
}

// Defauts dont un point tombe sur ce segment.
function segDefects(n, i) {
  const key = T.rings.get(n).key;
  return T.defects.filter((f) => f.pts.some((p) => Math.floor(p.r) === n && T.geo.segIndex(key, p.d, p.r - n) === i));
}

function segDetail(r, i) {
  const b = T.geo.bounds(r.key);
  const list = segDefects(r.n, i);
  return `<h2>${tr('d.ring')} ${r.n} · ${esc(T.geo.names[i])}</h2>
    <dl class="kv"><dt>${tr('col.segment')}</dt><dd>${esc(T.geo.names[i])}</dd><dt>${tr('col.position')}</dt><dd>${clock((b[i] + b[i + 1]) / 2)}</dd>
    <dt>${tr('col.station')}</dt><dd>${T.station(r.n)}</dd><dt>${tr('d.keySet')}</dt><dd>K${r.key}</dd>
    <dt>${tr('d.defects')}</dt><dd>${list.length}</dd></dl>
    <div class="switch">${list.map((f) => `<button class="btn" type="button" data-def="${esc(f.id)}">${esc(tr('tool.' + f.type))}</button>`).join('')}</div>
    <p class="empty">${tr('d.segHint')}</p>`;
}

function defectForm(f) {
  const row = defectRow(f, T);
  const types = Object.keys(TYPES).filter((k) => !!TYPES[k].line === !!TYPES[f.type].line);
  const opts = (list, cur, label) => list.map((v) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(label(v))}</option>`).join('');
  return `<h2>${esc(row.type)}</h2>
    <dl class="kv"><dt>${tr('col.ring')}</dt><dd>${row.rings}</dd><dt>${tr('col.station')}</dt><dd>${row.station}</dd>
    <dt>${tr('col.segment')}</dt><dd>${esc(row.segment)}</dd><dt>${tr('col.position')}</dt><dd>${row.position}</dd>
    ${row.lengthText ? `<dt>${tr('col.length')}</dt><dd>${row.lengthText}</dd>` : ''}</dl>
    ${types.length > 1 ? `<label class="f">${tr('col.type')} <select id="dT">${opts(types, f.type, (k) => tr('tool.' + k))}</select></label>` : ''}
    <div class="row2"><label class="f">${tr('col.severity')} <select id="dG">${opts([1, 2, 3], f.g, (g) => tr('sev.' + g))}</select></label>
    <label class="f">${tr('col.status')} <select id="dS">${opts(STATUS, f.stat, (s) => tr('st.' + s))}</select></label></div>
    <div class="row2"><label class="f">${tr('d.date')} <input id="dD" type="date" value="${esc(f.date)}"></label>
    <label class="f">${tr('d.by')} <input id="dB" value="${esc(f.by)}"></label></div>
    <label class="f">${tr('col.note')} <textarea id="dN" rows="2">${esc(f.note)}</textarea></label>
    <div class="thumbs" id="dThumbs"></div>
    <label class="btn primary center"><span>${tr('d.addPhotos')}</span><input id="dPhoto" type="file" accept="image/*" multiple class="vh"></label>
    <div class="switch">${S.v3d ? '' : `<button class="btn" id="d3d" type="button">${tr('d.view3d')}</button>`}<button class="btn" id="dMove" type="button">${tr(TYPES[f.type].line ? 'd.moveLine' : 'd.movePoint')}</button>
    <button class="btn danger" id="dDel" type="button">${tr('d.delete')}</button></div>`;
}

// La suppression est gardee comme une fiche : la fusion ne fait pas revenir le defaut.
async function deleteDefect(f) {
  if (!confirm(tr('msg.confirmDelete'))) return;
  f.deleted = true;
  await saveDefect(f);
  for (const p of await store.photosOf(f.id)) await deletePhoto(p);
  T.defects = T.defects.filter((x) => x !== f);
  if (S.sel === f.id) S.sel = null;
  refresh();
  say(tr('msg.deleted'));
}

function detail() {
  const f = T.defects.find((x) => x.id === S.sel);
  const box = $('detail');
  if (f) {
    box.innerHTML = defectForm(f);
    const save = async () => {
      await saveDefect(f);
      stats();
      table();
      draw();
    };
    const bind = (id, apply) => {
      const e = $(id);
      if (e) e.onchange = () => { apply(e.value); save(); };
    };
    if ($('dT')) $('dT').onchange = (e) => { f.type = e.target.value; save().then(detail); };
    bind('dG', (v) => (f.g = Number(v)));
    bind('dS', (v) => (f.stat = v));
    bind('dD', (v) => (f.date = v));
    bind('dB', (v) => (f.by = v));
    bind('dN', (v) => (f.note = v));
    $('dMove').onclick = () => {
      S.moving = f.id;
      setTool(f.type);
      say(tr(TYPES[f.type].line ? 'msg.lineHint' : 'msg.moveHint'));
    };
    $('dDel').onclick = () => deleteDefect(f);
    if ($('d3d')) $('d3d').onclick = () => open3D(ringSpan(f)[0], f.pts[0].d);
    $('dPhoto').onchange = (e) => addPhotos(f, [...e.target.files]);
    showThumbs(f);
    return;
  }
  const r = T.rings.get(S.ringSel);
  if (r && S.seg?.n === r.n) {
    box.innerHTML = segDetail(r, S.seg.i);
    box.querySelectorAll('[data-def]').forEach((e) => (e.onclick = () => selectDefect(T.defects.find((x) => x.id === e.dataset.def))));
    return;
  }
  if (r) {
    box.innerHTML = ringDetail(r);
    if ($('d3d')) $('d3d').onclick = () => open3D(r.n, 0);
    const k = $('rK');
    if (k) k.onchange = async (e) => {
      r.key = Number(e.target.value);
      r.updatedAt = new Date().toISOString();
      await store.saveRings([r]);
      draw();
      table();
      say(tr('msg.keyFixed'));
    };
    return;
  }
  box.innerHTML = `<h2>${tr('d.ring')}</h2><p class="empty">${tr('d.ringEmpty')}</p>`;
}

function table() {
  const a = $('fType').value;
  const b = $('fStat').value;
  const list = sortDefects(T.defects).filter((f) => (!a || f.type === a) && (!b || f.stat === b));
  $('count').textContent = tr(list.length > 1 ? 'reg.countN' : 'reg.count1', { n: list.length });
  $('rows').innerHTML = list.map((f) => {
    const r = defectRow(f, T);
    const c = (key, html) => `<td data-label="${esc(tr('col.' + key))}">${html}</td>`;
    return `<tr data-id="${esc(f.id)}" class="${f.id === S.sel ? 'on' : ''}">${c('ring', r.rings)}${c('station', r.station)}${c('segment', esc(r.segment))}${c('position', r.position)}
      ${c('type', `<i class="dot" style="background:var(--${f.type})"></i>${esc(r.type)}`)}
      ${c('severity', `<span class="pill g${f.g}">${esc(r.severity)}</span>`)}${c('length', r.lengthText ?? '–')}${c('status', esc(r.status))}${c('photos', r.photos || '–')}${c('date', esc(r.date))}${c('by', esc(r.by))}${c('note', esc(r.note))}
      <td class="acts"><button class="btn mini" type="button" data-act="edit">${tr('act.edit')}</button><button class="btn mini danger" type="button" data-act="delete">${tr('act.delete')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="13" class="empty">${tr('reg.empty')}</td></tr>`;
}

const onSmallScreen = () => matchMedia('(max-width: 900px)').matches;
const showDetail = () => onSmallScreen() && $('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

function selectDefect(f) {
  S.sel = f.id;
  S.seg = null;
  markSeg();
  S.ringSel = ringSpan(f)[0];
  setTool('view');
  showScreen('ring');
  centerRing(S.ringSel);
  detail();
  table();
  showDetail();
}

// Sur telephone et tablette, un seul ecran a la fois. La carte cachee perd son defilement.
function showScreen(name) {
  if (scroller.clientWidth) S.scrollX = scroller.scrollLeft;
  S.screen = name;
  document.body.dataset.screen = name;
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.screen === name));
  if (name === 'tun') openTunnel();
  if (!T || !scroller.clientWidth) return;
  resize();
  if (S.front) {
    S.front = false;
    goToFront();
  } else scroller.scrollLeft = S.scrollX;
  draw();
}
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-screen]');
  if (b) {
    showScreen(b.dataset.screen);
    scrollTo(0, 0);
  }
});

$('rows').addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const f = T.defects.find((x) => x.id === row.dataset.id);
  if (e.target.closest('[data-act="delete"]')) deleteDefect(f);
  else selectDefect(f);
});

function poseForm() {
  const next = T.lastRing + 1;
  $('addN').value = next <= T.total ? next : tr('pose.done');
  $('addKey').innerHTML = keyOptions(P.keyPositions);
  $('addDate').value = today();
  $('offset').textContent = T.offsetM == null ? tr('pose.noOffset') : tr('pose.offset', { v: T.offsetM });
}

function refresh() {
  stats();
  detail();
  table();
  poseForm();
  draw();
}

function setTool(k) {
  S.tool = k;
  if (k === 'view') S.moving = null;
  document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === k));
  canvas.classList.toggle('drawing', k !== 'view');
}

let toastTimer;
function say(msg) {
  const e = $('toast');
  e.textContent = msg;
  e.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (e.hidden = true), 3500);
}

function saveFile(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// --- Photos --------------------------------------------------------------
async function showThumbs(f) {
  const photos = await store.photosOf(f.id);
  const box = $('dThumbs');
  if (!box || S.sel !== f.id) return;
  box.innerHTML = photos.map((p) => `<figure><img alt="" src="${p.data}" data-open="${esc(p.id)}"><button class="btn mini danger" type="button" data-del="${esc(p.id)}" aria-label="${tr('act.delete')}">×</button></figure>`).join('');
  box.onclick = async (e) => {
    const shown = photos.find((p) => p.id === e.target.dataset.open);
    if (shown) {
      $('bigPhoto').src = shown.data;
      $('photoDlg').showModal();
    }
    const gone = photos.find((p) => p.id === e.target.dataset.del);
    if (gone && confirm(tr('msg.confirmPhoto'))) {
      await deletePhoto(gone);
      f.photos = Math.max(0, (f.photos ?? 1) - 1);
      await saveDefect(f);
      table();
      showThumbs(f);
    }
  };
}

async function deletePhoto(p) {
  await store.savePhoto({ ...p, data: '', deleted: true, updatedAt: new Date().toISOString() });
}

async function addPhotos(f, files) {
  let done = 0;
  for (const file of files) {
    try {
      const now = new Date().toISOString();
      await store.savePhoto({
        id: crypto.randomUUID(), defect: f.id, tunnel: f.tunnel, data: await compressImage(file),
        by: S.author, createdAt: now, updatedAt: now,
      });
      done++;
    } catch {
      say(tr('msg.photoFail'));
    }
  }
  if (!done) return;
  f.photos = (f.photos ?? 0) + done;
  await saveDefect(f);
  table();
  showThumbs(f);
  say(tr('msg.photoAdded', { n: done }));
}
$('photoDlg').onclick = () => $('photoDlg').close();

// --- Vue 3D --------------------------------------------------------------
const c3 = $('c3d');
const fingers = new Map();
let gesture = null;

function paint3D(ctx, fromFt, toFt, w, h) {
  drawStrip(ctx, {
    layout: T.layout, rings: T.rings, defects: T.defects, geo: T.geo, typeOf: T.typeOf,
    fromFt, toFt, scale: w / (toFt - fromFt), x0: 0, top: 0, H: h, c: colors,
    selRing: S.ringSel, selId: S.sel, k: 2, overlay: R3?.mode === 'ar',
  });
}

function markSeg() {
  if (!S.v3d) return;
  const r = S.seg && T.rings.get(S.seg.n);
  if (!r) return R3.setSegment(null);
  const { n, i } = S.seg;
  const b = T.geo.bounds(r.key);
  const O = T.geo.offsets;
  R3.setSegment({ from: T.layout.start[n], to: T.layout.start[n + 1], a: b[i], b: b[i + 1], oa: O[i], ob: O[i + 1] });
}

function show3D(n, deg) {
  const a = Math.max(1, n - 1);
  const b = Math.min(T.total, n + 1);
  const s = T.layout.start;
  S.ringSel = n;
  R3.setRange(s[a], s[b + 1], s[n], s[n + 1], T.geo.circ / (2 * Math.PI));
  markSeg();
  if (deg !== undefined) R3.look(deg);
  $('v3dTitle').textContent = `${tr('d.ring')} ${n}`;
  $('v3dPrev').disabled = !T.rings.has(n - 1);
  $('v3dNext').disabled = !T.rings.has(n + 1);
  detail();
  table();
}

async function open3D(n, deg) {
  try {
    R3 ??= await Ring3D.create(c3, paint3D);
  } catch {
    say(tr('msg.no3d'));
    return;
  }
  S.v3d = true;
  $('v3d').hidden = false;
  $('side3d').append($('detail'));
  R3.resize();
  show3D(n, deg);
  setMode3D('model');
}

function setMode3D(mode) {
  stopCamera();
  R3.setMode(mode);
  document.querySelectorAll('[data-m3d]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m3d === mode));
  $('v3d').dataset.mode = mode;
  $('v3dHelp').textContent = tr('help.' + mode);
  showFreeze();
  if (mode === 'ar') startCamera();
}

// --- Camera et gyroscope -------------------------------------------------
const video = $('arVideo');
const still = $('arStill');

function onOrientation(e) {
  if (e.alpha !== null && S.v3d) R3.setDevice(e.alpha, e.beta, e.gamma, screen.orientation?.angle ?? 0);
}

function showFreeze() {
  $('arFreeze').textContent = tr(R3.frozen ? 'ar.resume' : 'ar.freeze');
}

async function startCamera() {
  window.addEventListener('deviceorientation', onOrientation);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false });
    if (R3.mode !== 'ar') {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    video.srcObject = stream;
    video.hidden = false;
    await video.play();
  } catch {
    say(tr('msg.noCamera'));
  }
}

function stopCamera() {
  window.removeEventListener('deviceorientation', onOrientation);
  video.srcObject?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  video.hidden = true;
  still.hidden = true;
  if (R3) R3.frozen = false;
}

// Figer l'image : le gabarit ne bouge plus, on dessine calmement, et la photo est gardee.
function freezeCamera() {
  if (R3.frozen) {
    R3.frozen = false;
    still.hidden = true;
    video.play().catch(() => {});
  } else {
    if (!video.videoWidth) return say(tr('msg.noCamera'));
    video.pause();
    R3.frozen = true;
  }
  showFreeze();
}

$('arFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  still.src = await compressImage(file);
  await still.decode();
  still.hidden = false;
  video.pause();
  R3.frozen = true;
  showFreeze();
});

async function attachFrozenPhoto(f) {
  if (!S.v3d || R3.mode !== 'ar' || !R3.frozen) return;
  const source = still.hidden ? video : still;
  const [w, h] = still.hidden ? [video.videoWidth, video.videoHeight] : [still.naturalWidth, still.naturalHeight];
  const now = new Date().toISOString();
  await store.savePhoto({ id: crypto.randomUUID(), defect: f.id, tunnel: f.tunnel, data: R3.snapshot(source, w, h), by: S.author, createdAt: now, updatedAt: now });
  f.photos = (f.photos ?? 0) + 1;
  await saveDefect(f);
}

document.querySelectorAll('[data-m3d]').forEach((b) => (b.onclick = async () => {
  // iOS exige que l'autorisation du gyroscope soit demandee directement au toucher.
  if (b.dataset.m3d === 'ar' && DeviceOrientationEvent?.requestPermission) {
    await DeviceOrientationEvent.requestPermission().catch(() => say(tr('msg.noGyro')));
  }
  setMode3D(b.dataset.m3d);
}));
$('arFreeze').onclick = freezeCamera;

function close3D() {
  S.v3d = false;
  S.draft = null;
  S.seg = null;
  fingers.clear();
  R3.setDraft(null);
  R3.setSegment(null);
  stopCamera();
  $('v3d').hidden = true;
  document.querySelector('.side').prepend($('detail'));
  setTool('view');
  refresh();
}

function hit3D(e, solid) {
  const h = R3.hit(e.clientX, e.clientY, solid);
  return h && { r: T.layout.rOf(Math.max(0, Math.min(T.layout.length - 0.001, h.ft))), d: Math.max(-180, Math.min(180, h.d)), outside: h.outside };
}

const draft3D = () => R3.setDraft(S.draft.map((p) => [T.layout.ftOf(p.r), p.d]));

// Distance en pieds entre un toucher et chaque defaut, pour la selection en 3D.
function pick3D(p) {
  const px = T.layout.ftOf(p.r);
  const py = (p.d / 360) * T.geo.circ;
  const xy = (q) => [T.layout.ftOf(q.r), (q.d / 360) * T.geo.circ];
  let best = null;
  let bestD = 1;
  for (const f of T.defects) {
    const pts = f.pts.map(xy);
    pts.forEach(([ax, ay], i) => {
      const [bx, by] = pts[i + 1] ?? [ax, ay];
      const l = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const u = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l));
      const dist = Math.hypot(ax + u * (bx - ax) - px, ay + u * (by - ay) - py);
      if (dist < bestD) {
        bestD = dist;
        best = f;
      }
    });
  }
  return best;
}

const centroid = () => {
  const v = [...fingers.values()];
  return [v.reduce((s, p) => s + p[0], 0) / v.length, v.reduce((s, p) => s + p[1], 0) / v.length];
};
const spread = () => {
  const [a, b] = [...fingers.values()];
  return b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
};
const angle = () => {
  const [a, b] = [...fingers.values()];
  return b ? (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI : 0;
};

c3.addEventListener('pointerdown', (e) => {
  fingers.set(e.pointerId, [e.clientX, e.clientY]);
  c3.setPointerCapture(e.pointerId);
  gesture = { at: centroid(), spread: spread(), angle: angle(), moved: false };
  if (fingers.size > 1) {
    S.draft = null;
    R3.setDraft(null);
    return;
  }
  if (S.tool === 'view') return;
  const p = hit3D(e);
  if (!p) return;
  if (!isBuilt(p)) return say(tr('msg.notLaid'));
  if (TYPES[S.tool].line) S.draft = [p];
  else placeDefect(S.tool, [p]);
});
c3.addEventListener('pointermove', (e) => {
  if (!fingers.has(e.pointerId)) return;
  fingers.set(e.pointerId, [e.clientX, e.clientY]);
  if (S.draft) {
    const p = hit3D(e);
    if (p) S.draft.push(p);
    draft3D();
    return;
  }
  if (S.tool !== 'view' && fingers.size < 2) return;
  const [x, y] = centroid();
  const [dx, dy] = [x - gesture.at[0], y - gesture.at[1]];
  if (Math.hypot(dx, dy) > 3) gesture.moved = true;
  R3.orbit(dx, dy);
  if (fingers.size === 2 && gesture.spread) {
    R3.zoom(spread() / gesture.spread);
    R3.twist(angle() - gesture.angle);
    gesture.spread = spread();
    gesture.angle = angle();
    gesture.moved = true;
  }
  gesture.at = [x, y];
});
function release(e) {
  fingers.delete(e.pointerId);
  if (S.draft && !fingers.size) return finishDraft();
  if (fingers.size) {
    gesture = { at: centroid(), spread: spread(), angle: angle(), moved: true };
    return;
  }
  if (S.tool !== 'view' || gesture?.moved) return;
  const p = hit3D(e, true);
  if (!p) return;
  const f = p.outside ? null : pick3D(p);
  S.sel = f?.id ?? null;
  const n = f ? ringSpan(f)[0] : Math.floor(p.r);
  const r = !f && T.rings.get(n);
  const i = r ? T.geo.segIndex(r.key, p.d, p.r - n) : null;
  // Un second toucher sur le meme segment le deselectionne.
  S.seg = r && !(S.seg?.n === n && S.seg.i === i) ? { n, i } : null;
  if (T.rings.has(n) && n !== S.ringSel) show3D(n);
  else {
    markSeg();
    draw();
    detail();
    table();
  }
}
c3.addEventListener('pointerup', release);
c3.addEventListener('pointercancel', release);
c3.addEventListener('wheel', (e) => {
  e.preventDefault();
  R3.zoom(e.deltaY < 0 ? 1.1 : 0.9);
}, { passive: false });
$('v3dClose').onclick = close3D;
$('v3dPrev').onclick = () => { S.sel = null; S.seg = null; show3D(S.ringSel - 1); };
$('v3dNext').onclick = () => { S.sel = null; S.seg = null; show3D(S.ringSel + 1); };
new ResizeObserver(() => S.v3d && R3.resize()).observe(c3);

// --- Tunnel 3D -----------------------------------------------------------
const cT = $('cTun');
const tFingers = new Map();
let tGesture = null;

function buildTunnel() {
  const last = T.lastRing;
  $('tunEmpty').hidden = !!last;
  $('tunRing').max = Math.max(1, last);
  $('tunRing').value = Math.max(1, last);
  $('tunLabel').textContent = last ? `${tr('d.ring')} ${last}` : '';
  $('tunNoAxis').hidden = !!T.axis;
  TUN.build(T, colors);
  if (T.axis) TUN.view('all');
  else if (last) TUN.focusRing(last);
}

async function openTunnel() {
  if (!T) return;
  try {
    TUN ??= await Tunnel3D.create(cT, $('tunOver'));
  } catch {
    say(tr('msg.no3d'));
    return;
  }
  $('tunBox').hidden = false;
  S.tun = true;
  TUN.resize();
  buildTunnel();
}

$('tun3dOpen').onclick = openTunnel;
$('tunRing').oninput = (e) => {
  const n = Number(e.target.value);
  $('tunLabel').textContent = `${tr('d.ring')} ${n}`;
  if (T.lastRing) TUN.focusRing(n);
};
document.querySelectorAll('[data-tunview]').forEach((b) => (b.onclick = () => TUN.view(b.dataset.tunview)));
const tCentre = () => {
  const v = [...tFingers.values()];
  return [v.reduce((s, p) => s + p[0], 0) / v.length, v.reduce((s, p) => s + p[1], 0) / v.length];
};
const tSpread = () => {
  const [a, b] = [...tFingers.values()];
  return b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
};
cT.addEventListener('pointerdown', (e) => {
  tFingers.set(e.pointerId, [e.clientX, e.clientY]);
  cT.setPointerCapture(e.pointerId);
  tGesture = { at: tCentre(), spread: tSpread(), moved: tFingers.size > 1 };
});
cT.addEventListener('pointermove', (e) => {
  if (!tFingers.has(e.pointerId)) return;
  tFingers.set(e.pointerId, [e.clientX, e.clientY]);
  const [x, y] = tCentre();
  const [dx, dy] = [x - tGesture.at[0], y - tGesture.at[1]];
  if (Math.hypot(dx, dy) > 3) tGesture.moved = true;
  TUN.orbit(dx, dy);
  if (tFingers.size === 2 && tGesture.spread) {
    TUN.zoom(tSpread() / tGesture.spread);
    tGesture.spread = tSpread();
  }
  tGesture.at = [x, y];
});
function tRelease(e) {
  tFingers.delete(e.pointerId);
  if (tFingers.size) {
    tGesture = { at: tCentre(), spread: tSpread(), moved: true };
    return;
  }
  if (tGesture?.moved) return;
  const h = TUN.hit(e.clientX, e.clientY);
  const r = h && T.rings.get(h.n);
  if (!r) return;
  const b = T.geo.bounds(r.key);
  S.sel = null;
  S.seg = h;
  showScreen('ring');
  centerRing(h.n);
  open3D(h.n, (b[h.i] + b[h.i + 1]) / 2);
}
cT.addEventListener('pointerup', tRelease);
cT.addEventListener('pointercancel', () => tFingers.clear());
cT.addEventListener('wheel', (e) => {
  e.preventDefault();
  TUN.zoom(e.deltaY < 0 ? 1.15 : 0.87);
}, { passive: false });
new ResizeObserver(() => S.tun && TUN.resize()).observe(cT);

// --- Ecran Projet --------------------------------------------------------
const dlg = $('projDlg');
const fileName = (p, suffix) => `${p.name.replace(/[^\w -]+/g, '_')}${suffix}`;

function fillProjectForm(p) {
  $('pName').value = p.name;
  $('pUnit').value = p.unit;
  $('pCirc').value = p.circumference;
  $('pTaper').value = p.keyTaper;
  $('pKeys').value = p.keyPositions;
  $('pSegs').value = segmentsText(p);
  $('pTypes').value = typesText(p);
  $('pTunnels').value = tunnelsText(p);
  $('pErr').textContent = '';
}

function readProjectForm() {
  return normalizeProject({
    ...(dlg.dataset.id ? { id: dlg.dataset.id, rfr: P?.rfr } : {}),
    ...(dlg.dataset.id && P?.axis ? { axis: P.axis } : {}),
    format: FORMAT, name: $('pName').value, unit: $('pUnit').value,
    circumference: $('pCirc').value, keyTaper: $('pTaper').value, keyPositions: $('pKeys').value,
    segments: parseSegments($('pSegs').value), ringTypes: parseTypes($('pTypes').value),
    tunnels: parseTunnels($('pTunnels').value).map((t) => {
      const old = dlg.dataset.id && P?.tunnels.find((x) => x.id === t.id);
      return old?.axisStart === undefined ? t : { ...t, axisStart: old.axisStart, axisDir: old.axisDir };
    }),
  });
}

function openProject(p) {
  dlg.dataset.id = p?.id ?? '';
  fillProjectForm(p ?? TEMPLATE);
  $('pDelete').hidden = !p;
  $('pExport').hidden = !p;
  $('pCancel').hidden = !P;
  dlg.showModal();
}

async function addProject(p) {
  const i = PROJECTS.findIndex((x) => x.id === p.id);
  if (i >= 0) PROJECTS[i] = p;
  else PROJECTS.push(p);
  await store.setMeta('projects', PROJECTS);
  await loadProject(p.id);
}

$('pSave').onclick = async () => {
  try {
    const p = readProjectForm();
    dlg.close();
    await addProject(p);
    say(tr('msg.projectSaved'));
  } catch (err) {
    $('pErr').textContent = message(err);
  }
};
$('pCancel').onclick = () => dlg.close();
$('pExport').onclick = () => {
  try {
    saveFile(fileName(readProjectForm(), '.ringproject.json'), JSON.stringify(readProjectForm(), null, 2), 'application/json');
  } catch (err) {
    $('pErr').textContent = message(err);
  }
};
$('pDelete').onclick = async () => {
  if (!confirm(tr('msg.confirmProject', { p: P.name }))) return;
  await store.deleteProject(P.id);
  PROJECTS = PROJECTS.filter((x) => x !== P);
  await store.setMeta('projects', PROJECTS);
  P = null;
  T = null;
  dlg.close();
  if (PROJECTS.length) await loadProject(PROJECTS[0].id);
  else openProject(null);
};
$('pImport').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const p = normalizeProject(JSON.parse(await file.text()));
    dlg.close();
    await addProject(p);
    say(tr('msg.projectSaved'));
  } catch (err) {
    $('pErr').textContent = err instanceof SyntaxError ? tr('err.notProject') : message(err);
  }
});
$('bProject').onclick = () => openProject(P);
$('bNewProject').onclick = () => openProject(null);
$('project').onchange = (e) => loadProject(e.target.value);

// --- Actions -------------------------------------------------------------
document.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => {
  S.moving = null;
  setTool(b.dataset.tool);
}));
$('tunnels').addEventListener('click', (e) => {
  const b = e.target.closest('[data-t]');
  if (b) loadTunnel(b.dataset.t);
});
$('fType').onchange = table;
$('fStat').onchange = table;
$('lang').onchange = async (e) => {
  prefs.lang = e.target.value;
  await store.setMeta('lang', prefs.lang);
  applyI18n();
  if (S.v3d) {
    $('v3dHelp').textContent = tr('help.' + R3.mode);
    showFreeze();
  }
  if (T) refresh();
};
$('unit').onchange = async (e) => {
  prefs.unit = e.target.value;
  await store.setMeta('unit', prefs.unit);
  if (T) refresh();
};
$('zoom').oninput = (e) => {
  const centre = (scroller.scrollLeft + (scroller.clientWidth - AXIS) / 2) / S.scale;
  S.scale = Number(e.target.value);
  spacer.style.width = T.layout.length * S.scale + AXIS + 'px';
  scroller.scrollLeft = centre * S.scale - (scroller.clientWidth - AXIS) / 2;
  draw();
};
$('goForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const n = Number($('goN').value);
  if (!(n >= 1 && n <= T.total)) return say(tr('msg.ringLimit', { n: T.total }));
  S.ringSel = T.rings.has(n) ? n : null;
  S.sel = null;
  centerRing(n);
  detail();
});
$('author').onchange = (e) => {
  S.author = e.target.value.trim();
  store.setMeta('author', S.author);
};
$('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = T.lastRing + 1;
  if (n > T.total) return;
  const r = {
    tunnel: T.key, n, key: Number($('addKey').value), opt: 0, pm: null,
    date: $('addDate').value, by: S.author, source: 'saisie', updatedAt: new Date().toISOString(),
  };
  await store.saveRings([r]);
  T.rings.set(n, r);
  S.ringSel = n;
  S.sel = null;
  refresh();
  goToFront();
  say(tr('msg.ringSaved', { n, k: r.key }));
});
$('rfr').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const parsed = parseRFR(await file.text(), P.rfr, P.keyPositions);
    if (parsed.rings[parsed.rings.length - 1].n > T.total) throw new Error(tr('msg.rfrTooLong', { n: T.total }));
    const m = mergeRFR([...T.rings.values()], parsed, T.key, new Date().toISOString());
    await store.saveRings(m.rings);
    m.rings.forEach((r) => T.rings.set(r.n, r));
    if (parsed.offsetM != null) {
      T.offsetM = parsed.offsetM;
      await store.setMeta('offset-' + T.key, parsed.offsetM);
    }
    refresh();
    goToFront();
    say(tr('msg.rfrRead', { n: m.rings.length, a: m.added }) + (m.corrected.length ? tr('msg.rfrFixed', { n: m.corrected.length }) : ''));
  } catch (err) {
    say(message(err));
  }
});
$('bPrint').onclick = async () => {
  await buildReport($('report'), T, S.author);
  await Promise.all([...document.querySelectorAll('#report img')].map((i) => i.decode().catch(() => {})));
  window.print();
};
$('bExcel').onclick = () => exportExcel(T);
$('bBackup').onclick = async () => {
  const data = await store.exportProject(P);
  saveFile(fileName(P, ` ${S.author || 'data'} ${today()}.json`), JSON.stringify(data), 'application/json');
  say(tr('msg.backup'));
};
$('restore').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data?.app !== 'ring-mapping' || !data.project) throw new Error('err.notData');
    const project = normalizeProject(data.project);
    const n = await store.importData(data);
    await addProject(PROJECTS.find((p) => p.id === project.id) ?? project);
    say(tr('msg.restored', { r: n.rings, d: n.defects }));
  } catch (err) {
    say(err instanceof SyntaxError ? tr('err.notData') : message(err));
  }
});
window.addEventListener('resize', resize);

(async () => {
  prefs.lang = await store.getMeta('lang', 'fr');
  prefs.unit = await store.getMeta('unit', 'ft');
  $('lang').value = prefs.lang;
  $('unit').value = prefs.unit;
  $('version').textContent = APP_VERSION;
  applyI18n();
  S.author = await store.getMeta('author', '');
  $('author').value = S.author;
  setTool('view');
  navigator.storage?.persist?.(); // limite l'effacement des photos par le navigateur
  PROJECTS = await store.getMeta('projects', []);
  showScreen(PROJECTS.length ? 'ring' : 'data');
  if (PROJECTS.length) await loadProject(await store.getMeta('project'));
  else openProject(null);
  if ('serviceWorker' in navigator) {
    const updating = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => updating && say(tr('msg.updated', { v: APP_VERSION })));
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
