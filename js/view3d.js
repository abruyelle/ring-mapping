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
