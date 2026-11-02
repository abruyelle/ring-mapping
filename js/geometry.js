// Geometrie des anneaux, decrite par le fichier projet.
// Angles en degres depuis la crown, sens horaire. La cle est le premier segment de la liste.
const mod = (v, m) => ((v % m) + m) % m;
const FT_PER_M = 3937 / 1200;

export const toFt = (v, unit) => (unit === 'm' ? v * FT_PER_M : v);

// Angle ramene dans [-180, 180[ : plus court chemin entre deux points de l'anneau.
export const wrapDeg = (d) => mod(d + 180, 360) - 180;

export function makeGeometry(p) {
  const circ = toFt(p.circumference, p.unit);
  const taper = (toFt(p.keyTaper, p.unit) / circ) * 360;
  const names = p.segments.map((s) => s.name);
  const degs = p.segments.map((s) => s.deg);
  const n = names.length;
  // Le decalage des joints biseautes rend la cle plus large cote anneau suivant.
  const offsets = Array.from({ length: n + 1 }, (_, i) => (i === 0 || i === n ? taper : i === 1 ? -taper : 0));

  function bounds(key) {
    let centre = (key % p.keyPositions) * (360 / p.keyPositions);
    if (centre >= 180) centre -= 360;
    const b = [centre - degs[0] / 2];
    degs.forEach((d, i) => b.push(b[i] + d));
    return b;
  }

  function segAt(key, deg) {
    const v = mod(deg - bounds(key)[0], 360);
    let c = 0;
    for (let i = 0; i < n; i++) {
      c += degs[i];
      if (v < c) return names[i];
    }
    return names[n - 1];
  }

  // Segment sous un point de l'anneau, joints biseautes compris. u : 0 a 1 le long de l'anneau.
  function segIndex(key, deg, u = 0.5) {
    const b = bounds(key);
    const edge = (i) => b[i] + offsets[i] * (1 - 2 * u);
    const v = mod(deg - edge(0), 360);
    for (let i = 1; i < n; i++) if (v < edge(i) - edge(0)) return i - 1;
    return n - 1;
  }

  return { circ, taper, names, n, offsets, bounds, segAt, segIndex };
}

// Trace du tunnel : position du centre et direction d'avancement a une abscisse de l'axe.
// x = Est, y = hauteur, z = -Nord, autour du centre du trace pour garder la precision.
export class AxisPath {
  constructor(axis) {
    const pts = axis.points;
    const mid = pts[Math.floor(pts.length / 2)];
    this.origin = mid;
    this.height = axis.height ?? 0;
    this.scale = axis.coordScale ?? 1;
    this.pts = pts.map(([e, n, z]) => [e - mid[0], z - mid[2] + this.height, -(n - mid[1])]);
    this.s = [0];
    for (let i = 1; i < pts.length; i++) {
      this.s.push(this.s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    }
    this.length = this.s[this.s.length - 1];
  }

  index(s) {
    let lo = 0;
    let hi = this.s.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.s[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  at(s) {
    const i = this.index(s);
    const [a, b] = [this.pts[i], this.pts[i + 1]];
    const f = (s - this.s[i]) / (this.s[i + 1] - this.s[i]);
    return a.map((v, k) => v + (b[k] - v) * f);
  }

  tangent(s) {
    const i = this.index(s);
    const [a, b] = [this.pts[i], this.pts[i + 1]];
    const d = b.map((v, k) => v - a[k]);
    const l = Math.hypot(...d);
    return d.map((v) => v / l);
  }

  // Coordonnees du guidage (x, y, z) ramenees dans le repere du trace.
  fromSurvey([e, n, z]) {
    const k = this.scale;
    return [e * k - this.origin[0], z * k - this.origin[2], -(n * k - this.origin[1])];
  }
}

export function clock(deg) {
  const h = Math.round(mod(deg, 360) / 30) % 12;
  return (h === 0 ? 12 : h) + 'h';
}

export function labelAt(plan, n) {
  let label = plan[0][1];
  for (const [from, l] of plan) {
    if (from > n) break;
    label = l;
  }
  return label;
}

// Position le long du tunnel, en tenant compte des largeurs d'anneau.
export class Layout {
  constructor(plan, total, widthOf) {
    this.total = total;
    this.labels = new Array(total + 2);
    this.start = new Float64Array(total + 2);
    this.widthOf = widthOf;
    this.maxWidth = 0;
    for (let n = 1; n <= total; n++) {
      this.labels[n] = labelAt(plan, n);
      const w = widthOf(this.labels[n]);
      this.maxWidth = Math.max(this.maxWidth, w);
      this.start[n + 1] = this.start[n] + w;
    }
    this.length = this.start[total + 1];
  }

  label(n) {
    return this.labels[n] ?? this.labels[1];
  }

  width(n) {
    return this.widthOf(this.label(n));
  }

  ringAtFt(ft) {
    let lo = 1;
    let hi = this.total;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.start[mid] <= ft) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  ftOf(r) {
    const n = Math.max(1, Math.min(this.total, Math.floor(r)));
    return this.start[n] + (r - n) * this.width(n);
  }

  rOf(ft) {
    const n = this.ringAtFt(ft);
    return n + (ft - this.start[n]) / this.width(n);
  }
}

export function crackLength(pts, layout, circ) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = layout.ftOf(pts[i].r) - layout.ftOf(pts[i - 1].r);
    const dy = (wrapDeg(pts[i].d - pts[i - 1].d) / 360) * circ;
    s += Math.hypot(dx, dy);
  }
  return s;
}

const M_PER_US_FT = 1200 / 3937;

// Pieds : 175+94.52 (centaines de pieds). Metres : 5+362.82 (kilometres).
export function fmtStation(ft, unit = 'ft') {
  const v = Math.round((unit === 'm' ? ft * M_PER_US_FT : ft) * 100) / 100;
  const step = unit === 'm' ? 1000 : 100;
  const head = Math.floor(v / step);
  return head + '+' + (v - head * step).toFixed(2).padStart(unit === 'm' ? 6 : 5, '0');
}

export function lenValue(ft, unit = 'ft') {
  return unit === 'm' ? Number((ft * M_PER_US_FT).toFixed(2)) : Number(ft.toFixed(1));
}

export const fmtLen = (ft, unit = 'ft') => lenValue(ft, unit) + ' ' + unit;
