// Dessin du developpe sur un canvas : utilise a l'ecran et pour les bandes du rapport.
export const LIGHT = {
  bg: '#FFFFFF', fg: '#23282D', muted: '#5C656D', line: '#CDD2D6', accent: '#E8541E',
  seg: '#D7DBDE', segB: '#BEC5CA', segLine: '#7D868D', ghost: '#ECEEF0',
  crack: '#C41E3A', zone: '#D9480F', leak: '#1668C7', spall: '#7A3FB5', lip: '#0E7C66', other: '#8A6D00',
  typeA: '#7D868D', typeB: '#0E8C8C', typeU: '#CDD2D6',
};

export function drawStrip(ctx, o) {
  const { layout, rings, defects, fromFt, toFt, scale, x0, top, H, c, geo, typeOf } = o;
  const k = o.k ?? 1; // agrandit traits et textes pour la texture 3D
  const X = (ft) => x0 + (ft - fromFt) * scale;
  const Y = (d) => top + ((d + 180) / 360) * H;
  const a = layout.ringAtFt(Math.max(0, fromFt));
  const b = layout.ringAtFt(Math.min(layout.length, toFt));
  const pxRing = layout.maxWidth * scale;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, top - 40, X(toFt) - x0, H + 40);
  ctx.clip();

  ctx.font = '500 11px Consolas, monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  const step = pxRing >= 24 ? 10 : pxRing >= 12 ? 20 : pxRing >= 6 ? 50 : 100;
  for (let n = a; n <= b; n++) {
    const xa = X(layout.start[n]);
    const xb = X(layout.start[n + 1]);
    const type = typeOf(layout.label(n));
    ctx.fillStyle = type.material === 'concrete' ? c.typeA : type.material === 'fiber' ? c.typeB : c.typeU;
    ctx.fillRect(xa, top - 9, xb - xa, type.narrow ? 7 : 4);
    if (n % step === 0) {
      ctx.fillStyle = c.muted;
      ctx.fillText(String(n), (xa + xb) / 2, top - 14);
    }
    const ring = rings.get(n);
    if (ring) drawRing(ctx, geo, ring.key, xa, xb, Y, top, H, c, pxRing, k, o.overlay);
    else if (!o.overlay) {
      ctx.fillStyle = c.ghost;
      ctx.fillRect(xa, top, xb - xa, H);
      if (pxRing >= 8) {
        ctx.strokeStyle = c.line;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(xa, top, xb - xa, H);
      }
    }
  }

  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = c.fg;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (const d of [-90, 0, 90]) {
    ctx.beginPath();
    ctx.moveTo(x0, Y(d));
    ctx.lineTo(X(toFt), Y(d));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  if (o.selRing && o.selRing >= a && o.selRing <= b) {
    ctx.strokeStyle = c.fg;
    ctx.lineWidth = 2 * k;
    ctx.strokeRect(X(layout.start[o.selRing]), top, (layout.start[o.selRing + 1] - layout.start[o.selRing]) * scale, H);
  }

  for (const f of defects) drawDefect(ctx, f, f.id === o.selId, layout, X, Y, c, k);
  if (o.draft?.length > 1) drawCrack(ctx, o.draft, 2, c.crack, layout, X, Y);
  ctx.restore();
}

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function drawRing(ctx, geo, key, xa, xb, Y, top, H, c, pxRing, k, overlay) {
  const b = geo.bounds(key);
  const O = geo.offsets;
  const n = geo.n;
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = c.segLine;
  ctx.save();
  ctx.beginPath();
  ctx.rect(xa, top, xb - xa, H);
  ctx.clip();
  for (let i = 0; i < n; i++) {
    for (const sh of [0, -360, 360]) {
      const lo = Math.min(b[i], b[i + 1]) - geo.taper + sh;
      const hi = Math.max(b[i], b[i + 1]) + geo.taper + sh;
      if (lo >= 180 || hi <= -180) continue;
      poly(ctx, [
        [xa, Y(b[i] + O[i] + sh)], [xb, Y(b[i] - O[i] + sh)],
        [xb, Y(b[i + 1] - O[i + 1] + sh)], [xa, Y(b[i + 1] + O[i + 1] + sh)],
      ]);
      if (overlay) {
        // Gabarit sur la camera : seulement les joints, l'image reste visible.
        ctx.strokeStyle = i === 0 ? c.accent : '#FFFFFF';
        ctx.lineWidth = 2 * k;
      } else {
        ctx.fillStyle = i === 0 ? c.accent : i === 1 || i === n - 1 ? c.segB : c.seg;
        ctx.fill();
      }
      ctx.stroke();
      const ym = Y((b[i] + b[i + 1]) / 2 + sh);
      if (pxRing >= 18 && !overlay) {
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(xa, ym);
        ctx.lineTo(xb, ym);
        ctx.moveTo((xa + xb) / 2, Y(b[i] + sh));
        ctx.lineTo((xa + xb) / 2, Y(b[i + 1] + sh));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (pxRing >= 26) {
        ctx.fillStyle = overlay ? '#FFFFFF' : i === 0 ? c.bg : c.fg;
        if (k > 1) {
          // Vu de l'interieur, le tunnel defile vers le bas de l'ecran : le texte doit suivre.
          ctx.save();
          ctx.transform(0, 1, 1, 0, (xa + xb) / 2 + 14 * k, ym);
          ctx.font = `500 ${15 * k}px Consolas, monospace`;
          ctx.fillText(geo.names[i], 0, 0);
          ctx.restore();
        } else {
          ctx.font = '500 10px Consolas, monospace';
          ctx.fillText(geo.names[i], (xa + xb) / 2, ym + 14);
        }
      }
    }
  }
  ctx.restore();
}

function drawCrack(ctx, pts, width, color, layout, X, Y) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = X(layout.ftOf(p.r));
    const y = Y(p.d);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();
}

function drawDefect(ctx, f, selected, layout, X, Y, c, k) {
  if (f.type === 'zone') {
    poly(ctx, f.pts.map((p) => [X(layout.ftOf(p.r)), Y(p.d)]));
    ctx.fillStyle = c.zone;
    ctx.globalAlpha = selected ? 0.45 : 0.28;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = selected ? c.fg : c.zone;
    ctx.lineWidth = (selected ? 2.5 : 1.5) * k;
    ctx.stroke();
    return;
  }
  if (f.type === 'crack') {
    if (selected) {
      ctx.globalAlpha = 0.3;
      drawCrack(ctx, f.pts, 8 * k, c.fg, layout, X, Y);
      ctx.globalAlpha = 1;
    }
    drawCrack(ctx, f.pts, (1 + f.g * 0.7) * k, c.crack, layout, X, Y);
    return;
  }
  const x = X(layout.ftOf(f.pts[0].r));
  const y = Y(f.pts[0].d);
  const s = (4 + f.g * 1.5) * k;
  if (selected) {
    ctx.strokeStyle = c.fg;
    ctx.lineWidth = 2 * k;
    ctx.setLineDash([4 * k, 3 * k]);
    ctx.beginPath();
    ctx.arc(x, y, s + 6 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = c[f.type];
  ctx.strokeStyle = c.bg;
  ctx.lineWidth = k;
  if (f.type === 'leak') {
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
  } else if (f.type === 'spall') {
    poly(ctx, [[x, y - s - 1], [x + s + 1, y], [x, y + s + 1], [x - s - 1, y]]);
  } else if (f.type === 'lip') {
    poly(ctx, [[x, y - s - 1], [x + s + 1, y + s], [x - s - 1, y + s]]);
  } else {
    poly(ctx, [[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s]]);
  }
  ctx.fill();
  ctx.stroke();
}
