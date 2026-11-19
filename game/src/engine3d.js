// Solmar Bay 2 — the 3D engine: a hand-written software renderer on a 2D
// canvas. No library, no WebGL: the city is boxes, quads and billboards
// projected with a chase camera and painted far-to-near. Golden-hour light
// is baked into the face shading and the sky gradient.

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  let cam = { x: 0, y: 8, z: -20, yaw: 0, pitch: 0.16 };
  let focal = 600;
  const FOV = (72 * Math.PI) / 180;
  const drawList = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    focal = (H / 2) / Math.tan(FOV / 2);
  }

  function setCamera(c) { cam = c; }

  function cameraVectors() {
    const f = { x: Math.sin(cam.yaw), y: -Math.sin(cam.pitch), z: Math.cos(cam.yaw) };
    const fl = Math.hypot(f.x, f.y, f.z);
    f.x /= fl; f.y /= fl; f.z /= fl;
    // right = worldUp x forward, up = forward x right (right-handed camera).
    let r = { x: f.z, y: 0, z: -f.x };
    const rl = Math.hypot(r.x, r.z) || 1;
    r = { x: r.x / rl, y: 0, z: r.z / rl };
    const u = { x: f.y * r.z - f.z * r.y, y: f.z * r.x - f.x * r.z, z: f.x * r.y - f.y * r.x };
    return { f, r, u };
  }

  /** Camera-space coords of a world point (right, up, forward). */
  function camSpace(x, y, z) {
    const { f, r, u } = cameraVectors();
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    return {
      cx: dx * r.x + dy * r.y + dz * r.z,
      cy: dx * u.x + dy * u.y + dz * u.z,
      cz: dx * f.x + dy * f.y + dz * f.z,
    };
  }

  /** Project a world point to screen space; null when behind the camera. */
  function project(x, y, z) {
    const p = camSpace(x, y, z);
    if (p.cz < 0.6) return null;
    return { x: W / 2 + (p.cx * focal) / p.cz, y: H / 2 - (p.cy * focal) / p.cz, d: p.cz };
  }

  function poly(points, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
    const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
    const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
    return `rgb(${r},${g},${b})`;
  }

  function quad3d(corners, fill) {
    // Clip the polygon against the near plane in camera space, so a quad
    // that straddles the camera still draws its visible part instead of
    // vanishing (this is what keeps the ground under the camera).
    const NEAR = 0.6;
    const pts = corners.map((c) => camSpace(c[0], c[1], c[2]));
    const clipped = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const aIn = a.cz >= NEAR, bIn = b.cz >= NEAR;
      if (aIn) clipped.push(a);
      if (aIn !== bIn) {
        const t = (NEAR - a.cz) / (b.cz - a.cz);
        clipped.push({ cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, cz: NEAR });
      }
    }
    if (clipped.length < 3) return;
    const sp = clipped.map((p) => ({ x: W / 2 + (p.cx * focal) / p.cz, y: H / 2 - (p.cy * focal) / p.cz, d: p.cz }));
    // Sort key: the polygon's FARTHEST vertex. A ground quad that runs
    // from the camera's nose to the horizon must paint before the car
    // standing on it, not after it (its near edge is closer than the car).
    const d = Math.max(...sp.map((p) => p.d));
    drawList.push({ d, fn: () => poly(sp, fill) });
  }

  function drawWindows3d(a, b, c, d, cols, rows, litColor, darkColor) {
    // a,b = bottom edge (3D), d,c = top edge; draw a grid of window dots on the face.
    const pts = [];
    for (let rI = 0; rI < rows; rI++) {
      for (let cI = 0; cI < cols; cI++) {
        const u = (cI + 0.5) / cols, v = (rI + 0.5) / rows;
        const x = a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v;
        const y = a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v;
        const z = a[2] + (b[2] - a[2]) * u + (d[2] - a[2]) * v;
        const p = project(x, y, z);
        if (p) pts.push({ p, lit: ((rI * 7 + cI * 3) % 5) < 2 });
      }
    }
    if (pts.length === 0) return;
    const d0 = Math.max(...pts.map((q) => q.p.d));
    drawList.push({
      d: d0 - 0.05,
      fn: () => {
        for (const q of pts) {
          const s = Math.max(2, 260 / q.p.d);
          ctx.fillStyle = q.lit ? litColor : darkColor;
          ctx.fillRect(q.p.x - s / 2, q.p.y - s / 2, s, s * 1.4);
        }
      },
    });
  }

  /** Add a 3D box. `box`: {x, z, y=0 base, w, d, h, color, roof?, windows=true}. */
  function addBox(box) {
    const y0 = box.y || 0;
    const y1 = y0 + box.h;
    const x0 = box.x - box.w / 2, x1 = box.x + box.w / 2;
    const z0 = box.z - box.d / 2, z1 = box.z + box.d / 2;
    const cx = box.x - cam.x, cz = box.z - cam.z;
    const dist = Math.hypot(cx, cz);
    if (dist > 420) return;
    const top = shade(box.color, 1.22);
    const sideA = shade(box.color, 0.82);
    const sideB = shade(box.color, 0.62);
    const roof = box.roof || shade(box.color, 1.05);
    // Faces: [corners, fill, normalAxis] — draw only faces turned toward the camera.
    const faces = [
      { c: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], fill: roof, top: true },
      { c: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], fill: sideA, nz: 1 },
      { c: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], fill: sideB, nx: 1 },
      { c: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], fill: sideB, nx: -1 },
      { c: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], fill: sideA, nz: -1 },
    ];
    for (const face of faces) {
      if (face.top) { quad3d(face.c, face.fill); continue; }
      const mx = (face.c[0][0] + face.c[2][0]) / 2 - cam.x;
      const mz = (face.c[0][2] + face.c[2][2]) / 2 - cam.z;
      const facing = (face.nx || 0) * mx + (face.nz || 0) * mz;
      if (facing >= 0) continue; // face turned away
      quad3d(face.c, face.fill);
      if (box.windows !== false && box.h >= 6) {
        const cols = Math.max(2, Math.floor(Math.max(box.w, box.d) / 4));
        const rows = Math.max(2, Math.floor(box.h / 4.5));
        drawWindows3d(face.c[0], face.c[1], face.c[2], face.c[3], cols, rows, '#ffd98a', '#1c2340');
      }
    }
    void top;
  }

  /** A flat ground quad at height y. */
  function addGround(x0, z0, x1, z1, y, color) {
    quad3d([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], color);
  }

  /** A vertical billboard quad (palm fronds, signs): corners in world space. */
  function addQuad(points, color) { quad3d(points, color); }

  /** A 3D line (bullet tracer, rotor): drawn in screen space after projection. */
  function addLine(a, b, color, width) {
    const pa = project(a[0], a[1], a[2]);
    const pb = project(b[0], b[1], b[2]);
    if (!pa || !pb) return;
    const d = Math.max(pa.d, pb.d);
    drawList.push({
      d,
      fn: () => {
        ctx.strokeStyle = color; ctx.lineWidth = width || 2;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      },
    });
  }

  /** A glowing 3D point (muzzle flash, explosion, marker beam base). */
  function addGlow(x, y, z, radius, color, alpha) {
    const p = project(x, y, z);
    if (!p || p.d < 2) return;
    const r = Math.min(90, Math.max(2, (radius * focal) / p.d));
    drawList.push({
      d: p.d,
      fn: () => {
        // Soft radial falloff so a glow reads as light, not a flat disc.
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = alpha ?? 0.8;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      },
    });
  }

  /** A vertical light beam (mission marker): translucent pillar + ground ring. */
  function addBeam(x, z, color) {
    const base = project(x, 0, z);
    const top = project(x, 90, z);
    if (!base || !top) return;
    const w = Math.max(4, (5 * focal) / base.d);
    drawList.push({
      d: base.d,
      fn: () => {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = color;
        ctx.fillRect(base.x - w / 2, top.y, w, base.y - top.y);
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.ellipse(base.x, base.y, w * 1.4, w * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      },
    });
  }

  function drawSky(sunX) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b1b52');
    g.addColorStop(0.42, '#7a3b6e');
    g.addColorStop(0.62, '#e8705a');
    g.addColorStop(0.78, '#ffb35c');
    g.addColorStop(1, '#ffd98a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun: low golden disc, placed by camera yaw so it stays ahead.
    const sx = W * (0.5 + 0.28 * Math.sin(sunX || 0));
    const sy = H * 0.52;
    const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 130);
    sg.addColorStop(0, 'rgba(255,240,180,0.95)');
    sg.addColorStop(0.25, 'rgba(255,190,90,0.75)');
    sg.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx, sy, 130, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath(); ctx.arc(sx, sy, 26, 0, Math.PI * 2); ctx.fill();
    // Cloud bands.
    ctx.fillStyle = 'rgba(255,205,170,0.28)';
    for (let i = 0; i < 5; i++) {
      const cxp = ((i * 317 + 120) % 1000) / 1000 * W;
      const cyp = H * (0.16 + i * 0.045);
      ctx.beginPath(); ctx.ellipse(cxp, cyp, 120 + i * 22, 10 + i * 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Distant skyline silhouette along the horizon.
    ctx.fillStyle = 'rgba(46,22,64,0.55)';
    const horizon = H * 0.62;
    for (let i = 0; i < 26; i++) {
      const bx = ((i * 173 + 40) % 1400) - 200 + (W / 2);
      const bh = 24 + ((i * 53) % 70);
      ctx.fillRect(bx - W * 0.5 + ((i * 61) % W), horizon - bh, 34 + (i % 3) * 12, bh);
    }
  }

  function flush() {
    drawList.sort((a, b) => b.d - a.d);
    for (const item of drawList) item.fn();
    drawList.length = 0;
  }

  return { ctx, resize, setCamera, project, addBox, addGround, addQuad, addLine, addGlow, addBeam, drawSky, flush, shade, getW: () => W, getH: () => H };
}
