// Vue 3D d'un anneau et de ses voisins, depuis l'axe du tunnel.
// Le developpe est dessine dans une texture posee sur le cylindre : tout ce qui est vu ou trace
// en 3D reste exprime en position le long du tunnel et en angle depuis la crown.
let THREE = null;
const TEX_W = 512;
const TEX_H = 2048;
const STEPS = 96;
const rad = (d) => (d * Math.PI) / 180;

export class Ring3D {
  static async create(canvas, paint) {
    THREE ??= await import('../lib/three.module.min.js');
    return new Ring3D(canvas, paint);
  }

  constructor(canvas, paint) {
    this.canvas = canvas;
    this.paint = paint;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x23282d);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    this.camera.up.set(0, 0, 1); // le haut de l'ecran est l'anneau precedent
    this.yaw = 0;
    this.tilt = 0;
    this.tex = document.createElement('canvas');
    this.tex.width = TEX_W;
    this.tex.height = TEX_H;
    this.texture = new THREE.CanvasTexture(this.tex);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide }),
    );
    this.scene.add(this.mesh);
    this.draft = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc41e3a }));
    this.scene.add(this.draft);
    this.ray = new THREE.Raycaster();
    this.raf = 0;
    this.stale = true;
  }

  setRange(fromFt, toFt, centerFt, radius) {
    Object.assign(this, { fromFt, toFt, centerFt, radius });
    const pos = [];
    const uv = [];
    const index = [];
    for (let i = 0; i <= STEPS; i++) {
      const d = -180 + (360 * i) / STEPS;
      for (let j = 0; j <= 1; j++) {
        pos.push(...this.world(fromFt + j * (toFt - fromFt), d));
        uv.push(j, 1 - i / STEPS);
      }
      if (i < STEPS) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = this.mesh.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeBoundingSphere();
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
    const perPx = this.camera.fov / (this.canvas.clientHeight || 1);
    this.yaw -= dx * perPx;
    this.tilt = Math.max(-55, Math.min(55, this.tilt - dy * perPx));
    this.request();
  }

  zoom(ratio) {
    this.camera.fov = Math.max(12, Math.min(80, this.camera.fov / ratio));
    this.camera.updateProjectionMatrix();
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
    const [first] = this.ray.intersectObject(this.mesh);
    if (!first) return null;
    return { ft: this.fromFt + first.uv.x * (this.toFt - this.fromFt), d: (1 - first.uv.y) * 360 - 180 };
  }

  setDraft(points) {
    const flat = (points ?? []).flatMap(([ft, d]) => this.world(ft, d, 0.99));
    this.draft.geometry.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    this.draft.visible = flat.length > 3;
    this.request();
  }

  aim() {
    const y = rad(this.yaw);
    const t = rad(this.tilt);
    this.camera.lookAt(Math.sin(y) * Math.cos(t), Math.cos(y) * Math.cos(t), -Math.sin(t));
  }

  invalidate() {
    this.stale = true;
    this.request();
  }

  request() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      if (this.stale) {
        const ctx = this.tex.getContext('2d');
        ctx.clearRect(0, 0, TEX_W, TEX_H);
        this.paint(ctx, this.fromFt, this.toFt, TEX_W, TEX_H);
        this.texture.needsUpdate = true;
        this.stale = false;
      }
      this.aim();
      this.renderer.render(this.scene, this.camera);
    });
  }
}
