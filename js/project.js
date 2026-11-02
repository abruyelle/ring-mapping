// Description d'un projet : tout ce qui change d'un chantier a l'autre tient dans ce fichier.
// Les longueurs sont dans l'unite du projet (ft ou m). Les chainages RFR sont toujours en metres.
import { LEGACY_STATUS, STATUS, TYPES } from './config.js';

export const FORMAT = 'ring-mapping-project';

export const TEMPLATE = {
  format: FORMAT,
  version: 1,
  name: '',
  unit: 'ft',
  circumference: 60,
  keyTaper: 0,
  keyPositions: 12,
  segments: [
    { name: 'K', deg: 60 }, { name: 'S1', deg: 60 }, { name: 'S2', deg: 60 },
    { name: 'S3', deg: 60 }, { name: 'S4', deg: 60 }, { name: 'S5', deg: 60 },
  ],
  ringTypes: { A: { material: 'concrete', width: 5 } },
  tunnels: [{ id: 'T1', name: 'Tunnel 1', total: 1000, offsetM: null, plan: [[1, 'A']] }],
  rfr: { ring: 'AnnNum', pm: 'PM', keyProposed: 'CleOpt', key: 'ClePil' },
};

const num = (v, what) => {
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(what);
  return n;
};
const slug = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export function normalizeProject(raw) {
  if (raw?.format !== FORMAT) throw new Error('err.notProject');
  const name = String(raw.name ?? '').trim();
  if (!name) throw new Error('err.name');
  if (raw.unit !== 'ft' && raw.unit !== 'm') throw new Error('err.unit');
  const segments = (raw.segments ?? []).map((s) => ({ name: String(s.name).trim(), deg: num(s.deg, 'err.segments') }));
  const sum = segments.reduce((a, s) => a + s.deg, 0);
  if (segments.length < 3 || Math.abs(sum - 360) > 0.01 || segments.some((s) => !s.name || s.deg <= 0)) throw new Error('err.segments');
  const ringTypes = {};
  for (const [k, v] of Object.entries(raw.ringTypes ?? {})) {
    ringTypes[k] = { material: ['concrete', 'fiber', 'other'].includes(v.material) ? v.material : 'other', width: num(v.width, 'err.types') };
    if (ringTypes[k].width <= 0) throw new Error('err.types');
  }
  if (!Object.keys(ringTypes).length) throw new Error('err.types');
  const tunnels = (raw.tunnels ?? []).map((t) => {
    const plan = [...(t.plan ?? [])].map(([a, b]) => [num(a, 'err.tunnels'), String(b)]).sort((x, y) => x[0] - y[0]);
    if (!plan.length || plan.some(([, l]) => !ringTypes[l])) throw new Error('err.tunnels');
    const total = num(t.total, 'err.tunnels');
    if (!(total >= 1) || !String(t.id ?? '').trim() || !String(t.name ?? '').trim()) throw new Error('err.tunnels');
    return {
      id: String(t.id).trim(), name: String(t.name).trim(), total,
      offsetM: t.offsetM === null || t.offsetM === undefined || t.offsetM === '' ? null : num(t.offsetM, 'err.tunnels'), plan,
      ...(t.axisStart === undefined ? {} : { axisStart: num(t.axisStart, 'err.tunnels'), axisDir: t.axisDir < 0 ? -1 : 1 }),
    };
  });
  if (!tunnels.length || new Set(tunnels.map((t) => t.id)).size !== tunnels.length) throw new Error('err.tunnels');
  const circumference = num(raw.circumference, 'err.number');
  const keyPositions = num(raw.keyPositions, 'err.number');
  const keyTaper = num(raw.keyTaper ?? 0, 'err.number');
  if (circumference <= 0 || !Number.isInteger(keyPositions) || keyPositions < 1 || keyTaper < 0) throw new Error('err.number');
  return {
    format: FORMAT, version: 1, id: raw.id ? String(raw.id) : slug(name), name, unit: raw.unit,
    circumference, keyTaper, keyPositions, segments, ringTypes, tunnels,
    rfr: { ...TEMPLATE.rfr, ...raw.rfr },
    ...(raw.axis?.points?.length > 1 ? { axis: cleanAxis(raw.axis) } : {}),
  };
}

function cleanAxis(a) {
  const ok = Array.isArray(a.points) && a.points.every((p) => Array.isArray(p) && p.length >= 3 && p.every(Number.isFinite));
  const opt = (v) => v === undefined || Number.isFinite(v);
  if (!ok || !opt(a.height) || !opt(a.coordScale)) throw new Error('err.number');
  return a;
}

const isText = (v) => v === undefined || v === null || typeof v === 'string';
const isDate = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isId = (v) => typeof v === 'string' && /^[\w-]{1,64}$/.test(v);
const isNum = (v) => v === undefined || v === null || Number.isFinite(v);
const IMAGE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

// Fichier d'echange : tout vient de l'exterieur. Ne passent que les fiches conformes a ce projet.
export function cleanImport(data, project) {
  if (![data.rings, data.defects, data.photos ?? [], data.meta ?? []].every(Array.isArray)) throw new Error('err.notData');
  const totals = new Map(project.tunnels.map((t) => [`${project.id}/${t.id}`, t.total]));
  const inRange = (tunnel, n) => n >= 1 && n <= totals.get(tunnel);
  const rings = data.rings.filter((r) => Number.isInteger(r?.n) && inRange(r.tunnel, r.n)
    && Number.isInteger(r.key) && r.key >= 1 && r.key <= project.keyPositions
    && isNum(r.opt) && isNum(r.pm) && (r.ce === undefined || (Array.isArray(r.ce) && r.ce.length === 3 && r.ce.every(Number.isFinite)))
    && isText(r.source) && isText(r.date) && isText(r.by) && isDate(r.updatedAt));
  const defects = data.defects.filter((f) => isId(f?.id) && totals.has(f.tunnel) && Object.hasOwn(TYPES, f.type)
    && [1, 2, 3].includes(f.g) && (STATUS.includes(f.stat) || Object.hasOwn(LEGACY_STATUS, f.stat))
    && Array.isArray(f.pts) && f.pts.length > 0
    && f.pts.every((p) => Number.isFinite(p?.r) && Number.isFinite(p.d) && inRange(f.tunnel, Math.floor(p.r)))
    && isText(f.date) && isText(f.by) && isText(f.note) && isNum(f.photos) && isDate(f.updatedAt));
  const photos = (data.photos ?? []).filter((p) => isId(p?.id) && isId(p.defect) && totals.has(p.tunnel)
    && typeof p.data === 'string' && (IMAGE.test(p.data) || (p.deleted === true && p.data === ''))
    && isText(p.by) && isDate(p.createdAt) && isDate(p.updatedAt));
  const meta = (data.meta ?? []).filter((m) => typeof m?.k === 'string' && m.k.startsWith('offset-')
    && totals.has(m.k.slice('offset-'.length)) && isNum(m.v));
  const rejected = data.rings.length + data.defects.length + (data.photos?.length ?? 0) + (data.meta?.length ?? 0)
    - rings.length - defects.length - photos.length - meta.length;
  return { rings, defects, photos, meta, rejected };
}

// Champs texte de l'ecran Projet.
export const segmentsText = (p) => p.segments.map((s) => `${s.name}:${s.deg}`).join(', ');
export const typesText = (p) => Object.entries(p.ringTypes).map(([k, v]) => `${k} ${v.material} ${v.width}`).join('\n');
export const tunnelsText = (p) => p.tunnels
  .map((t) => [t.id, t.name, t.total, t.offsetM ?? '', t.plan.map(([a, b]) => `${a}:${b}`).join(' ')].join(' | ')).join('\n');

const lines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export const parseSegments = (s) => s.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
  const [name, deg] = x.split(':');
  return { name, deg };
});

export function parseTypes(s) {
  const out = {};
  for (const l of lines(s)) {
    const [k, material, width] = l.split(/\s+/);
    if (!k || width === undefined) throw new Error('err.types');
    out[k] = { material, width };
  }
  return out;
}

export const parseTunnels = (s) => lines(s).map((l) => {
  const [id, name, total, offsetM, plan] = l.split('|').map((x) => x.trim());
  if (!plan) throw new Error('err.tunnels');
  return { id, name, total, offsetM, plan: plan.split(/\s+/).map((x) => x.split(':')) };
});
