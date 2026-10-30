// Stockage sur l'appareil (IndexedDB). Toute la lecture et l'ecriture passent par cet objet.
// Les anneaux et defauts portent la cle "<projet>/<tunnel>".
const DB = 'ring-mapping';
const VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('rings', { keyPath: ['tunnel', 'n'] });
      db.createObjectStore('defects', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const dbReady = open();

async function tx(stores, mode, work) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const out = work(t);
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const all = (name) => tx([name], 'readonly', (t) => t.objectStore(name).getAll());
const inProject = (id) => (r) => r.tunnel.startsWith(id + '/');

// Garde la version la plus recente de chaque fiche : un defaut supprime reste supprime.
export function newerThan(incoming, existing, keyOf) {
  const old = new Map(existing.map((x) => [keyOf(x), x]));
  return incoming.filter((x) => {
    const o = old.get(keyOf(x));
    return !o || (x.updatedAt ?? '') > (o.updatedAt ?? '');
  });
}

export const store = {
  async rings(tunnel) {
    return (await all('rings')).filter((r) => r.tunnel === tunnel).sort((a, b) => a.n - b.n);
  },
  async defects(tunnel) {
    return (await all('defects')).filter((d) => d.tunnel === tunnel);
  },
  saveRings(rings) {
    return tx(['rings'], 'readwrite', (t) => {
      const s = t.objectStore('rings');
      rings.forEach((r) => s.put(r));
    });
  },
  saveDefect(d) {
    return tx(['defects'], 'readwrite', (t) => void t.objectStore('defects').put(d));
  },
  async getMeta(k, fallback = null) {
    const r = await tx(['meta'], 'readonly', (t) => t.objectStore('meta').get(k));
    return r ? r.v : fallback;
  },
  setMeta(k, v) {
    return tx(['meta'], 'readwrite', (t) => void t.objectStore('meta').put({ k, v }));
  },
  async deleteProject(id) {
    const rings = (await all('rings')).filter(inProject(id));
    const defects = (await all('defects')).filter(inProject(id));
    await tx(['rings', 'defects'], 'readwrite', (t) => {
      rings.forEach((r) => t.objectStore('rings').delete([r.tunnel, r.n]));
      defects.forEach((d) => t.objectStore('defects').delete(d.id));
    });
  },
  async exportProject(project) {
    const offsets = (await all('meta')).filter((m) => m.k.startsWith('offset-' + project.id + '/'));
    return {
      app: 'ring-mapping', version: VERSION, exportedAt: new Date().toISOString(), project,
      rings: (await all('rings')).filter(inProject(project.id)),
      defects: (await all('defects')).filter(inProject(project.id)),
      meta: offsets,
    };
  },
  async importData(data) {
    const rings = newerThan(data.rings, await all('rings'), (r) => r.tunnel + '#' + r.n);
    const defects = newerThan(data.defects, await all('defects'), (d) => d.id);
    await tx(['rings', 'defects', 'meta'], 'readwrite', (t) => {
      rings.forEach((r) => t.objectStore('rings').put(r));
      defects.forEach((d) => t.objectStore('defects').put(d));
      data.meta.forEach((m) => t.objectStore('meta').put(m));
    });
    return { rings: rings.length, defects: defects.length };
  },
};
