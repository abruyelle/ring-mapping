// Remplace js/store.js dans la demo : tout reste en memoire, rien n'est enregistre.
const PROJECT = window.__DEMO_PROJECT__;
const SEED = window.__DEMO_RINGS__;
const TUNNEL = PROJECT.id + '/' + PROJECT.tunnels[0].id;

function seedDefects() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const types = ['crack', 'leak', 'crack', 'spall', 'lip', 'crack', 'leak', 'other'];
  const stats = ['open', 'open', 'repair', 'open', 'closed'];
  const last = SEED.length;
  return Array.from({ length: 16 }, (_, i) => {
    const type = types[i % types.length];
    const r = 8 + rnd() * (last - 14);
    const d = -165 + rnd() * 330;
    const pts = [{ r, d }];
    if (type === 'crack') {
      const dr = (rnd() < 0.5 ? -1 : 1) * 0.4;
      const dd = (rnd() < 0.5 ? -1 : 1) * (6 + rnd() * 6);
      for (let j = 1; j < 5; j++) pts.push({ r: r + dr * j, d: Math.max(-179, Math.min(179, d + dd * j)) });
    }
    return {
      id: 'demo-' + String(i + 1).padStart(3, '0'), tunnel: TUNNEL, type, pts,
      g: 1 + Math.floor(rnd() * 3), stat: stats[i % stats.length],
      date: '2026-10-' + String(5 + i).padStart(2, '0'), by: 'Exemple', note: 'Exemple / Example',
    };
  });
}

const mem = {
  rings: SEED.map((r) => ({ ...r })),
  defects: seedDefects(),
  meta: new Map([['projects', [PROJECT]], ['project', PROJECT.id]]),
};

export const store = {
  async rings(tunnel) {
    return mem.rings.filter((r) => r.tunnel === tunnel).sort((a, b) => a.n - b.n);
  },
  async defects(tunnel) {
    return mem.defects.filter((d) => d.tunnel === tunnel);
  },
  async saveRings(rings) {
    rings.forEach((r) => {
      const i = mem.rings.findIndex((q) => q.tunnel === r.tunnel && q.n === r.n);
      if (i >= 0) mem.rings[i] = r;
      else mem.rings.push(r);
    });
  },
  async saveDefect(d) {
    if (!mem.defects.includes(d)) mem.defects.push(d);
  },
  async getMeta(k, fallback = null) {
    return mem.meta.has(k) ? mem.meta.get(k) : fallback;
  },
  async setMeta(k, v) {
    mem.meta.set(k, v);
  },
  async deleteProject() {},
  async photosOf() {
    return [];
  },
  async savePhoto() {},
  async exportProject(project) {
    return { app: 'ring-mapping', version: 1, exportedAt: new Date().toISOString(), project, rings: mem.rings, defects: mem.defects, meta: [] };
  },
  async importData() {
    return { rings: 0, defects: 0 };
  },
};
