// Lecture du fichier de guidage. Les noms de colonnes viennent du fichier projet.
const US_FT_PER_M = 3937 / 1200;

export const stationFt = (pm, offsetM) => (pm + offsetM) * US_FT_PER_M;

export function parseRFR(text, cols, keyPositions = 12) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error('err.rfrEmpty');
  const sep = lines[0].includes(';') ? ';' : ',';
  const head = lines[0].split(sep).map((s) => s.trim());
  const [a, b, o, p] = [cols.ring, cols.pm, cols.keyProposed, cols.key].map((c) => head.indexOf(c));
  if (a < 0 || b < 0 || o < 0 || p < 0) throw new Error('err.rfrColumns');
  // Le decalage de chainage est parfois ajoute a la main juste apres RingState.
  const extra = parseFloat(head[head.indexOf('RingState') + 1]);
  const rings = [];
  for (const line of lines.slice(1)) {
    const c = line.split(sep);
    const n = Number(c[a]);
    const key = Number(c[p]);
    if (!(key >= 1 && key <= keyPositions)) break; // lignes suivantes : anneaux non poses
    if (rings.length && n !== rings[rings.length - 1].n + 1) throw new Error('err.rfrGap');
    rings.push({ n, key, opt: Number(c[o]), pm: parseFloat(c[b].replace(',', '.')) });
  }
  if (!rings.length) throw new Error('err.rfrNone');
  return { rings, offsetM: head.includes('RingState') && Number.isFinite(extra) ? extra : null };
}

// Le guidage fait foi sur la cle ; la date et l'auteur saisis a la main sont conserves.
export function mergeRFR(existing, parsed, tunnel, now) {
  const byN = new Map(existing.map((r) => [r.n, r]));
  const rings = [];
  const corrected = [];
  let added = 0;
  for (const r of parsed.rings) {
    const old = byN.get(r.n);
    if (!old) added++;
    else if (old.key !== r.key) corrected.push(r.n);
    rings.push({
      tunnel, n: r.n, key: r.key, opt: r.opt, pm: r.pm,
      date: old?.date ?? '', by: old?.by ?? '', source: 'rfr', updatedAt: now,
    });
  }
  return { rings, added, corrected };
}
