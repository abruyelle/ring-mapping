// Description d'un projet : tout ce qui change d'un chantier a l'autre tient dans ce fichier.
// Les longueurs sont dans l'unite du projet (ft ou m). Les chainages RFR sont toujours en metres.
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
  };
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
