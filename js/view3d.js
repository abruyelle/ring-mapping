// Vues 3D d'un anneau : modele en orbite, vue interieure et gabarit sur la camera.
// Le developpe est dessine dans une texture posee sur le cylindre : tout ce qui est vu ou trace
// reste exprime en position le long du tunnel et en angle depuis la crown.
let THREE = null;
const TEX_W = 512;
const TEX_H = 2048;
const STEPS = 96;
const THICK = 1.06; // epaisseur d'affichage du modele, pas une cote
const rad = (d) => (d * Math.PI) / 180;

export class Ring3D {
  static async create(canvas, paint) {
    THREE ??= await import('../lib/three.module.min.js');
    return new Ring3D(canvas, paint);
  }

  constructor(canvas, paint) {
    this.canvas = canvas;
    this.paint = paint;
    this.mode = 'model';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    this.yaw = 0;
    this.tilt = 0;
    this.roll = 0;
    this.az = 30;
    this.el = 12;
    this.dist = 2.2;
    this.frozen = false;
    this.tex = document.createElement('canvas');
    this.tex.width = TEX_W;
    this.tex.height = TEX_H;
    this.texture = new THREE.CanvasTexture(this.tex);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const skin = new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide, transparent: true });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), skin); // anneau et voisins, vus de l'interieur
    this.inner = new THREE.Mesh(new THREE.BufferGeometry(), skin); // intrados du modele
    const shell = new THREE.MeshBasicMaterial({ color: 0x9aa3aa, side: THREE.DoubleSide });
    this.outer = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xb4bbc1, side: THREE.DoubleSide }));
    this.endA = new THREE.Mesh(new THREE.BufferGeometry(), shell);
    this.endB = new THREE.Mesh(new THREE.BufferGeometry(), shell);
    this.model = new THREE.Group();
    this.model.add(this.inner, this.outer, this.endA, this.endB);
    this.scene.add(this.mesh, this.model);
    this.draft = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc41e3a }));
    this.scene.add(this.draft);
    this.ray = new THREE.Raycaster();
    this.base = new THREE.Quaternion();
    this.delta = new THREE.Quaternion();
    this.device = null;
    this.raf = 0;
    this.stale = true;
    this.setMode('model');
  }

  setMode(mode) {
    this.mode = mode;
    this.mesh.visible = mode !== 'model';
    this.model.visible = mode === 'model';
    this.camera.up.set(0, mode === 'model' ? 1 : 0, mode === 'model' ? 0 : 1);
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.scene.background = mode === 'ar' ? null : new THREE.Color(0x23282d);
    this.roll = 0;
    this.base.identity();
    this.device = null;
    this.frozen = false;
    this.invalidate();
  }

  tube(fromFt, toFt, scale) {
    const pos = [];
    const uv = [];
    const index = [];
    const u = (ft) => (ft - this.fromFt) / (this.toFt - this.fromFt);
    for (let i = 0; i <= STEPS; i++) {
      const d = -180 + (360 * i) / STEPS;
      for (const ft of [fromFt, toFt]) {
        pos.push(...this.world(ft, d, scale));
        uv.push(u(ft), 1 - i / STEPS);
      }
      if (i < STEPS) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeBoundingSphere();
    return g;
  }

  // Anneau selectionne de ringFrom a ringTo, voisins compris de fromFt a toFt.
  setRange(fromFt, toFt, ringFrom, ringTo, radius) {
    Object.assign(this, { fromFt, toFt, centerFt: (ringFrom + ringTo) / 2, radius });
    this.mesh.geometry = this.tube(fromFt, toFt, 1);
    this.inner.geometry = this.tube(ringFrom, ringTo, 1);
    this.outer.geometry = this.tube(ringFrom, ringTo, THICK);
    const end = new THREE.RingGeometry(radius, radius * THICK, STEPS);
    this.endA.geometry = end;
    this.endB.geometry = end;
    const half = (ringTo - ringFrom) / 2;
    this.endA.position.z = half;
    this.endB.position.z = -half;
    this.invalidate();
  }

  // Crown en +Y, 3h en +X, anneaux suivants vers -Z : on regarde dans le sens de l'avancement.
  world(ft, deg, scale = 1) {
    const r = this.radius * scale;
    return [r * Math.sin(rad(deg)), r * Math.cos(rad(deg)), -(ft - this.centerFt)];
  }

  look(deg, tilt = 0) {
    this.yaw = deg;
    this.tilt = tilt;
    this.request();
  }

  orbit(dx, dy) {
    if (this.mode === 'model') {
      this.az -= dx * 0.4;
      this.el = Math.max(-85, Math.min(85, this.el + dy * 0.4));
    } else {
      const perPx = this.camera.fov / (this.canvas.clientHeight || 1);
      this.yaw -= dx * perPx;
      this.tilt = Math.max(-75, Math.min(75, this.tilt - dy * perPx));
    }
    this.request();
  }

  zoom(ratio) {
    if (this.mode === 'model') this.dist = Math.max(0.9, Math.min(5, this.dist / ratio));
    else {
      this.camera.fov = Math.max(12, Math.min(100, this.camera.fov / ratio));
      this.camera.updateProjectionMatrix();
    }
    this.request();
  }

  twist(deg) {
    if (this.mode === 'model') return;
    this.roll += deg;
    this.request();
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.request();
  }

  hit(clientX, clientY) {
    const b = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - b.left) / b.width) * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1);
    this.aim();
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(ndc, this.camera);
    const targets = this.mode === 'model' ? [this.inner, this.outer, this.endA, this.endB] : [this.mesh];
    const [first] = this.ray.intersectObjects(targets);
    if (!first?.uv || (this.mode === 'model' && first.object !== this.inner)) return null;
    return { ft: this.fromFt + first.uv.x * (this.toFt - this.fromFt), d: (1 - first.uv.y) * 360 - 180 };
  }

  setDraft(points) {
    const flat = (points ?? []).flatMap(([ft, d]) => this.world(ft, d, 0.99));
    this.draft.geometry.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    this.draft.visible = flat.length > 3;
    this.request();
  }

  // Orientation de l'appareil, memorisee par rapport a sa position a l'ouverture de la camera.
  setDevice(alpha, beta, gamma, screenAngle) {
    if (this.frozen) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(beta), rad(alpha), rad(-gamma), 'YXZ'));
    q.multiply(new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rad(-screenAngle)));
    this.device ??= q.clone().invert();
    this.delta.copy(this.device).multiply(q);
    this.request();
  }

  aim() {
    const cam = this.camera;
    if (this.mode === 'model') {
      const a = rad(this.az);
      const e = rad(this.el);
      const d = this.dist * this.radius;
      cam.position.set(d * Math.sin(a) * Math.cos(e), d * Math.sin(e), d * Math.cos(a) * Math.cos(e));
      cam.lookAt(0, 0, 0);
      return;
    }
    cam.position.set(0, 0, 0);
    const y = rad(this.yaw);
    const t = rad(this.tilt);
    cam.lookAt(Math.sin(y) * Math.cos(t), Math.cos(y) * Math.cos(t), -Math.sin(t));
    if (this.mode === 'ar') {
      cam.rotateZ(rad(this.roll));
      cam.quaternion.multiply(this.delta);
    }
  }

  draw() {
    if (this.stale) {
      const ctx = this.tex.getContext('2d');
      ctx.clearRect(0, 0, TEX_W, TEX_H);
      this.paint(ctx, this.fromFt, this.toFt, TEX_W, TEX_H);
      this.texture.needsUpdate = true;
      this.stale = false;
    }
    this.aim();
    this.renderer.render(this.scene, this.camera);
  }

  invalidate() {
    this.stale = true;
    this.request();
  }

  request() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw());
  }

  // Image de fond et gabarit reunis, pour la photo jointe au defaut.
  snapshot(source, sw, sh) {
    this.stale = true;
    this.draw();
    const box = this.canvas;
    const scale = Math.min(1, 1600 / Math.max(sw, sh));
    const out = document.createElement('canvas');
    const ratio = box.clientWidth / box.clientHeight;
    const crop = sw / sh > ratio ? [sh * ratio, sh] : [sw, sw / ratio];
    out.width = Math.round(crop[0] * scale);
    out.height = Math.round(crop[1] * scale);
    const ctx = out.getContext('2d');
    ctx.drawImage(source, (sw - crop[0]) / 2, (sh - crop[1]) / 2, crop[0], crop[1], 0, 0, out.width, out.height);
    ctx.drawImage(box, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.8);
  }
}

// Tous les anneaux montes, assembles en un seul objet pour rester fluide sur telephone.
export class Tunnel3D {
  static async create(canvas, overlay) {
    THREE ??= await import('../lib/three.module.min.js');
    return new Tunnel3D(canvas, overlay);
  }

  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.trace = null;
    this.built = [];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x23282d);
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 200000);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.scene.add(this.mesh);
    this.marks = null;
    this.target = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.az = 35;
    this.el = 18;
    this.dist = 70;
    this.raf = 0;
  }

  // Centre et direction d'un anneau : sur le trace s'il existe, sinon en ligne droite.
  frames(t) {
    const start = t.layout.start;
    const axis = t.axis;
    const place = (ft) => (axis
      ? { c: axis.path.at(t.axisStart + axis.dir * ft), d: axis.path.tangent(t.axisStart + axis.dir * ft).map((v) => v * axis.dir) }
      : { c: [0, 0, -ft], d: [0, 0, -1] });
    return (n) => {
      const [a, b] = [place(start[n]), place(start[n + 1])];
      const ce = axis && t.rings.get(n)?.ce;
      if (ce) {
        // Anneau construit : position relevee par le guidage plutot que theorique.
        const real = axis.path.fromSurvey(ce);
        const mid = a.c.map((v, i) => (v + b.c[i]) / 2);
        const shift = real.map((v, i) => v - mid[i]);
        a.c = a.c.map((v, i) => v + shift[i]);
        b.c = b.c.map((v, i) => v + shift[i]);
      }
      return [a, b];
    };
  }

  build(t, c) {
    const R = t.geo.circ / (2 * Math.PI);
    const { bounds, offsets, n: segs } = t.geo;
    const frame = this.frames(t);
    const pos = [];
    const col = [];
    const index = [];
    this.triRing = [];
    const paint = [c.accent, c.segB, c.seg].map((h) => new THREE.Color(h));
    const inset = 0.5; // laisse apparaitre les joints
    const gap = 0.15;
    // Point de la paroi : a droite en regardant vers l'avancement pour un angle positif.
    const wall = (f, a, along) => {
      const d = f.d;
      const h = Math.hypot(d[0], d[2]) || 1;
      const right = [-d[2] / h, 0, d[0] / h];
      const up = [right[1] * d[2] - right[2] * d[1], right[2] * d[0] - right[0] * d[2], right[0] * d[1] - right[1] * d[0]];
      const [sa, ca] = [Math.sin(rad(a)) * R, Math.cos(rad(a)) * R];
      return [0, 1, 2].map((k) => f.c[k] + right[k] * sa + up[k] * ca + d[k] * along);
    };
    for (const ring of t.rings.values()) {
      const b = bounds(ring.key);
      const [fa, fb] = frame(ring.n);
      for (let i = 0; i < segs; i++) {
        const steps = Math.max(2, Math.ceil((b[i + 1] - b[i]) / 7.5));
        const color = paint[i === 0 ? 0 : i === 1 || i === segs - 1 ? 1 : 2];
        const base = pos.length / 3;
        for (let k = 0; k <= steps; k++) {
          const f = k / steps;
          const d = b[i] + inset + f * (b[i + 1] - b[i] - 2 * inset);
          const o = offsets[i] + f * (offsets[i + 1] - offsets[i]);
          pos.push(...wall(fa, d + o, 0), ...wall(fb, d - o, -gap));
          col.push(color.r, color.g, color.b, color.r, color.g, color.b);
          if (k < steps) {
            const q = base + k * 2;
            index.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
            this.triRing.push(ring.n, ring.n);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
    g.computeBoundingSphere();
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    if (this.marks) {
      this.scene.remove(this.marks);
      this.marks.dispose();
      this.marks = null;
    }
    if (t.defects.length) {
      this.marks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial(), t.defects.length);
      const m = new THREE.Matrix4();
      t.defects.forEach((f, i) => {
        const p = f.pts[0];
        const n = Math.floor(p.r);
        const [fa, fb] = frame(n);
        const u = p.r - n;
        const here = { c: fa.c.map((v, k) => v + (fb.c[k] - v) * u), d: fa.d };
        m.setPosition(...wall(here, p.d, 0));
        this.marks.setMatrixAt(i, m);
        this.marks.setColorAt(i, new THREE.Color(c[f.type]));
      });
      this.scene.add(this.marks);
    }
    // Trace complet et partie construite, dessines par-dessus pour rester lisibles a toute echelle.
    this.trace = t.axis?.path.pts ?? null;
    this.built = [];
    if (t.axis) {
      const step = Math.max(1, Math.round(t.lastRing / 300));
      for (let n = 1; n <= t.lastRing; n += step) this.built.push(frame(n)[0].c);
      if (t.lastRing) this.built.push(frame(t.lastRing)[1].c);
    }
    this.frame = frame;
    this.request();
  }

  focusRing(n) {
    this.target.set(...this.frame(n)[0].c);
    if (this.dist > 600) this.dist = 120;
    this.request();
  }

  extent() {
    const box = new THREE.Box3();
    if (this.trace) this.trace.forEach((p) => box.expandByPoint(new THREE.Vector3(...p)));
    else box.setFromBufferAttribute(this.mesh.geometry.getAttribute('position'));
    return box;
  }

  // Vues rapides. Le tracé entier reste tres fin : ces vues servent a lire les courbes.
  view(kind) {
    if (kind === 'top') this.el = 89;
    if (kind === 'side') {
      this.el = 0;
      const size = this.extent().getSize(new THREE.Vector3());
      this.az = (Math.atan2(size.z, size.x) * 180) / Math.PI;
    }
    if (kind === 'all') {
      const box = this.extent();
      box.getCenter(this.target);
      this.dist = box.getSize(new THREE.Vector3()).length() * 1.2;
      this.el = 70;
    }
    this.request();
  }

  orbit(dx, dy) {
    this.az -= dx * 0.4;
    this.el = Math.max(-85, Math.min(85, this.el + dy * 0.4));
    this.request();
  }

  zoom(ratio) {
    this.dist = Math.max(4, Math.min(80000, this.dist / ratio));
    this.request();
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.request();
  }

  aim() {
    const a = rad(this.az);
    const e = rad(this.el);
    this.camera.position.set(
      this.target.x + this.dist * Math.sin(a) * Math.cos(e),
      this.target.y + this.dist * Math.sin(e),
      this.target.z + this.dist * Math.cos(a) * Math.cos(e),
    );
    this.camera.lookAt(this.target);
  }

  // Anneau sous le doigt, ou null a cote du tunnel.
  hit(clientX, clientY) {
    const b = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - b.left) / b.width) * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1);
    this.aim();
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(ndc, this.camera);
    const [first] = this.ray.intersectObject(this.mesh);
    return first ? this.triRing[first.faceIndex] : null;
  }

  request() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      this.aim();
      this.renderer.render(this.scene, this.camera);
      this.drawTrace();
    });
  }

  drawTrace() {
    const c = this.overlay;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const [w, h] = [c.clientWidth, c.clientHeight];
    if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
    if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.trace) return;
    const v = new THREE.Vector3();
    const stroke = (pts, color, width) => {
      ctx.beginPath();
      let pen = false;
      for (const p of pts) {
        v.set(...p).project(this.camera);
        if (Math.abs(v.z) > 1) {
          pen = false;
          continue;
        }
        const [x, y] = [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
        if (pen) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        pen = true;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.stroke();
    };
    ctx.globalAlpha = this.dist > 200 ? 1 : 0.35; // de pres, le trace ne doit pas masquer les anneaux
    stroke(this.trace, '#FFD23F', 2.5);
    stroke(this.built, '#E8541E', 5);
    ctx.globalAlpha = 1;
  }
}
