/* =========================================================
   Crehla — クレヨンで描く薔薇（Canvas 2D）

   ・塗り：形の中を、形の向きに沿った短いクレヨンの筆致で塗り重ねる
   ・紙目：塗った上から紙の凹凸で顔料を削り、白い紙をのぞかせる
   ・線　：揺らいで途切れるクレヨンの線で縁取る
   ・薔薇の花弁は 3D で形を計算し（blender/rose_geom.py と同じ考え方）、
     2D に投影してから手描きで塗る。形は正確、描き方は手描き
   ========================================================= */

// ---------- 小さな道具 ----------
const clamp01 = x => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeBack = x => { x = clamp01(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

export function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// 色の段：0 = 影, 0.45 = 地, 0.8 = 明, 1 = ハイライト
function ramp(p, s) {
  s = clamp01(s);
  if (s < 0.45) return mixc(p.dark, p.base, s / 0.45);
  if (s < 0.8) return mixc(p.base, p.light, (s - 0.45) / 0.35);
  return mixc(p.light, p.hi, (s - 0.8) / 0.2);
}

const pal = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hex(v)]));
export const PALETTES = {
  red:    pal({ dark: '#5E0A20', base: '#C01F3F', light: '#EE6E86', hi: '#FBD0D8', line: '#4E0718', accent: '#F0883E' }),
  pink:   pal({ dark: '#8E1F4E', base: '#DE4D86', light: '#F59DBE', hi: '#FDE3EC', line: '#741640', accent: '#F5B841' }),
  yellow: pal({ dark: '#B8561A', base: '#EE9E28', light: '#F9CC60', hi: '#FFF0C0', line: '#94400F', accent: '#EE6A45' }),
  coral:  pal({ dark: '#9A2A16', base: '#E5553A', light: '#F59A78', hi: '#FDE0D2', line: '#7A1E0E', accent: '#F6C452' }),
  cream:  pal({ dark: '#B98E5E', base: '#EFD7B4', light: '#F8EBD5', hi: '#FFFFFF', line: '#94703F', accent: '#F2AFA4' }),
  blue:   pal({ dark: '#0F2A66', base: '#2F5FC0', light: '#7FA4E6', hi: '#DCE7FB', line: '#0B1F4E', accent: '#8B6FD6' }),
  sky:    pal({ dark: '#4F7FBF', base: '#8FB8E8', light: '#C4DCF6', hi: '#F0F7FE', line: '#3A629A', accent: '#B9A8E8' }),
  navy:   pal({ dark: '#081A45', base: '#173A8C', light: '#4A72C4', hi: '#A9C2EE', line: '#061232', accent: '#6A55C0' }),
  white:  pal({ dark: '#A9B4C8', base: '#EEF0F5', light: '#FAFBFD', hi: '#FFFFFF', line: '#7F8CA6', accent: '#C9D6EE' }),
  violet: pal({ dark: '#4A2770', base: '#8A5BC0', light: '#BFA0E2', hi: '#EEE3FA', line: '#3A1C5A', accent: '#E98FB8' }),
};
// accent = 塗りにときどき混ぜる別の色のクレヨン
export const GREEN = pal({ dark: '#25602A', base: '#4E9E3A', light: '#9ACF62', hi: '#DDF0B0', line: '#1D4A20', accent: '#D9CF5A' });
export const SEED  = pal({ dark: '#4E321C', base: '#86573A', light: '#BE8C60', hi: '#E8C9A4', line: '#3A2414', accent: '#C9774A' });

// ---------- 紙目 ----------
// 紙の凸を表す模様。塗った絵の上に source-atop で重ねると、顔料が薄く乗った所が
// 温かいクリーム色にかすれる（背景の色はのぞかないので、暗い背景でも黒い点にならない）
export const GRAIN_TINT = [255, 244, 226];
export function makeGrain(size = 256, seed = 7, tint = GRAIN_TINT) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  const r = rng(seed);
  const lattice = n => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
  const noise = (lat, n, x, y) => {            // タイル状に繋がる値ノイズ
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const at = (i, j) => lat[((j % n + n) % n) * n + ((i % n + n) % n)];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), sx), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), sx), sy);
  };
  const n1 = 128, n2 = 32, L1 = lattice(n1), L2 = lattice(n2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // 少し斜めに伸びた紙の凹凸
    const u = x + y * 0.35, v = y - x * 0.12;
    const val = 0.50 * noise(L1, n1, u / size * n1 * 0.5, v / size * n1 * 1.5)
              + 0.30 * noise(L2, n2, x / size * n2, y / size * n2)
              + 0.20 * r();
    const a = smooth(0.63, 0.72, val);
    const i = (y * size + x) * 4;
    img.data[i] = tint[0]; img.data[i + 1] = tint[1]; img.data[i + 2] = tint[2];
    img.data[i + 3] = a * 235;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// ---------- クレヨンの塗り ----------
function polyPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * 形の中をクレヨンで塗る。
 * o.shade(x, y) → 0〜1（色の段）, o.angle = 筆致の向き, o.px = 1px の大きさ
 */
export function crayonFill(ctx, pts, o) {
  const b = bbox(pts);
  if (b.w < 1 || b.h < 1) return;
  const r = o.rnd, px = o.px;
  ctx.save();
  polyPath(ctx, pts);
  ctx.clip();
  // 下塗り：うすく地の色
  ctx.fillStyle = rgba(ramp(o.pal, o.shade(b.x0 + b.w / 2, b.y0 + b.h / 2)), 0.55);
  ctx.fill();
  ctx.lineCap = 'round';
  const len = o.len * px, sp = (o.spacing || 2.6) * px;
  const n = Math.min(1600, Math.ceil((b.w + len) * (b.h + len) / (sp * len) * 1.15));
  for (let i = 0; i < n; i++) {
    const x = b.x0 - len * 0.3 + r() * (b.w + len * 0.6);
    const y = b.y0 - len * 0.3 + r() * (b.h + len * 0.6);
    const a = (o.angleAt ? o.angleAt(x, y) : o.angle) + (r() - 0.5) * 0.35;
    const L = len * (0.5 + r() * 0.9);
    const ca = Math.cos(a) * L / 2, sa = Math.sin(a) * L / 2, bend = (r() - 0.5) * L * 0.25;
    const s = o.shade(x, y) + (r() - 0.5) * 0.30;
    const useAccent = o.pal.accent && r() < (o.accent ?? 0.07);
    ctx.strokeStyle = useAccent
      ? rgba(mixc(o.pal.accent, ramp(o.pal, s), 0.35), 0.5 * r() + 0.2)
      : rgba(ramp(o.pal, s), (o.alpha ?? 0.8) * (0.45 + 0.55 * r()));
    ctx.lineWidth = (o.width || 2.4) * px * (0.55 + 0.9 * r());
    ctx.beginPath();
    ctx.moveTo(x - ca, y - sa);
    ctx.quadraticCurveTo(x - sa / L * 2 * bend, y + ca / L * 2 * bend, x + ca, y + sa);
    ctx.stroke();
  }
  ctx.restore();
}

/** 揺らいで、ときどき途切れるクレヨンの線 */
export function crayonLine(ctx, pts, o) {
  if (pts.length < 2) return;
  const r = o.rnd, px = o.px;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < (o.passes || 2); pass++) {
    const j = (o.jitter ?? 1.2) * px;
    let ox = 0, oy = 0;
    const q = pts.map(([x, y]) => { ox = ox * 0.7 + (r() - 0.5) * j; oy = oy * 0.7 + (r() - 0.5) * j; return [x + ox, y + oy]; });
    let i = 0;
    while (i < q.length - 1) {
      const seg = 3 + ((r() * 6) | 0);
      if (r() < (o.gaps ?? 0.12)) { i += 1 + ((r() * 2) | 0); continue; }   // 途切れ
      ctx.strokeStyle = rgba(o.color, (o.alpha ?? 0.8) * (0.55 + 0.45 * r()));
      ctx.lineWidth = o.width * px * (0.6 + 0.7 * r());
      ctx.beginPath();
      ctx.moveTo(q[i][0], q[i][1]);
      for (let k = 1; k <= seg && i + k < q.length; k++) ctx.lineTo(q[i + k][0], q[i + k][1]);
      ctx.stroke();
      i += seg;
    }
  }
}

// ---------- 薔薇の花弁（3D で形を計算して投影） ----------
// 内 → 外の層。blender/rose_geom.py の LAYERS を、高芯咲きに調整したもの
const LAYERS = [
  { count: 2, length: 0.42, span: 1.90, bud: -0.40, bloom: -0.36, curl: 0.00, tone: -0.22 },
  { count: 3, length: 0.54, span: 1.70, bud: -0.30, bloom: -0.20, curl: 0.15, tone: -0.10 },
  { count: 4, length: 0.66, span: 1.55, bud: -0.20, bloom: 0.08,  curl: 0.75, tone: 0.00 },
  { count: 5, length: 0.78, span: 1.45, bud: -0.10, bloom: 0.26,  curl: 1.05, tone: 0.06 },
];
const ROLL = 0.22;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const hash = s => { const x = Math.sin(s * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

function petalPoint(li, pi, o, u, v) {
  const L = LAYERS[li], f = li / (LAYERS.length - 1);
  const seed = li * 31 + pi * 7 + 1;
  const center = pi * 2 * Math.PI / L.count + li * GOLDEN;
  const half = Math.PI / L.count * L.span;
  const lean = lerp(L.bud, L.bloom, o);
  const length = L.length * (0.84 + 0.16 * o);
  const r0 = 0.04 + 0.05 * f * o;
  const ph = hash(seed + 3) * 6.28;
  const vv = v * (1 - 0.38 * u * u);
  let r = r0, z = 0;
  const steps = Math.max(1, Math.round(vv * 14)), dl = vv * length / steps;
  for (let s = 0; s < steps; s++) {
    const t = (s + 0.5) / steps * vv;
    let phi = lean + (0.65 + 0.25 * o) * (1 - t) - (0.70 + 0.10 * o) * t * (1 - 0.45 * o * f)
            + o * L.curl * smooth(0.70, 1.0, t);
    r = Math.max(0.012, r + Math.sin(phi) * dl);
    z += Math.cos(phi) * dl;
  }
  const w = 0.30 + 0.70 * Math.pow(Math.sin(Math.PI / 2 * Math.min(1, vv / 0.6)), 0.7);
  const a = center + u * half * w;
  r += 0.06 * length * (1 - u * u) * Math.sin(Math.PI * vv);
  r += 0.025 * length * Math.sin(u * 2.6 + ph) * vv ** 3 * o;
  z += 0.035 * length * Math.cos(u * 2.2 + ph) * vv ** 3;
  r += ROLL * length * u * u * smooth(0.45, 1.0, vv) * o * (0.3 + 0.7 * f);
  z -= 0.5 * ROLL * length * u * u * smooth(0.6, 1.0, vv) * o * f;
  return [r * Math.cos(a), r * Math.sin(a), z];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LIGHT = norm([-0.5, -0.6, 0.65]);   // 左上手前から

/** 薔薇の頭。cx, cy = 付け根の位置, unit = 1 単位の px, open = 0〜1, tilt = 手前への傾き */
export function drawRose(ctx, cx, cy, unit, open, p, rndSeed, px, tilt) {
  const a = 0.30 + tilt;                      // 見下ろす角度
  const ca = Math.cos(a), sa = Math.sin(a);
  const proj = q => [cx + q[0] * unit, cy - (q[2] * ca + q[1] * sa) * unit, q[1] * ca - q[2] * sa];
  const NU = 10, NV = 9;
  const petals = [];
  LAYERS.forEach((L, li) => {
    for (let pi = 0; pi < L.count; pi++) {
      const P = (u, v) => petalPoint(li, pi, open, u, v);
      const loop = [];
      for (let i = 0; i <= NU; i++) loop.push(P(-1 + 2 * i / NU, 0));
      for (let j = 1; j <= NV; j++) loop.push(P(1, j / NV));
      const top = [];
      for (let i = NU; i >= 0; i--) top.push(P(-1 + 2 * i / NU, 1));
      loop.push(...top);
      for (let j = NV - 1; j >= 1; j--) loop.push(P(-1, j / NV));
      const c = P(0, 0.55), base = P(0, 0), tip = P(0, 1);
      let n = norm(cross(sub(P(0.1, 0.55), P(-0.1, 0.55)), sub(P(0, 0.62), P(0, 0.48))));
      if (dot(n, [c[0], c[1], 0]) < 0) n = n.map(x => -x);        // 外向きにそろえる
      const nDepth = n[1] * ca - n[2] * sa;
      const outer = nDepth < 0;                                  // 外側の面がこちらを向く
      const lum = 0.5 + 0.5 * dot(outer ? n : n.map(x => -x), LIGHT);
      const pl = loop.map(proj), pt = top.map(proj);
      const depth = pl.reduce((s, q) => s + q[2], 0) / pl.length;
      petals.push({ li, pi, pl, pt, depth, outer, lum, base: proj(base), tip: proj(tip) });
    }
  });
  petals.sort((x, y) => y.depth - x.depth);    // 奥から手前へ

  // 芯の渦巻き：開くにつれて、カップの口に濃い色のくるくるを描き込む
  const drawSpiral = () => {
    const sw = smooth(0.25, 0.8, open);
    if (sw <= 0.01) return;
    const r = rng(rndSeed + 7);
    // カップの口の中心（外の層の縁の高さ）に置き、手前の花弁に重ならないようにする
    const hc = petalPoint(LAYERS.length - 2, 0, open, 0, 1)[2] * 0.98;
    const [sx, sy] = proj([0, 0, hc]);
    const R = unit * 0.16 * (0.6 + 0.4 * open);
    const flat = Math.min(1, Math.sin(a) * 1.25);
    const arc = (r0, r1, th0, span) => {
      const q = [];
      for (let k = 0; k <= 22; k++) {
        const t = k / 22, th = th0 + span * t;
        const rr = lerp(r0, r1, t) * (1 + (r() - 0.5) * 0.08);
        q.push([sx + Math.cos(th) * rr, sy + Math.sin(th) * rr * flat]);
      }
      return q;
    };
    // 内から外へ、少しずつずれた弧を 5 本
    for (let k = 0; k < 5; k++) {
      const r0 = R * (0.10 + k * 0.20), r1 = R * (0.22 + k * 0.21);
      const th0 = 0.6 + k * 2.1 + (r() - 0.5) * 0.6;
      const span = 3.4 - k * 0.25 + (r() - 0.5) * 0.5;
      const q = arc(r0, r1, th0, span);
      crayonLine(ctx, q, { color: k < 2 ? p.line : p.dark, width: 3.0 - k * 0.25, alpha: 0.85 * sw, rnd: r, px, passes: 2, gaps: 0.06 });
      if (k > 0) crayonLine(ctx, q.slice(4).map(([x, y]) => [x + 1.5 * px, y - 2.5 * px]),
        { color: p.hi, width: 1.6, alpha: 0.55 * sw, rnd: r, px, passes: 1, gaps: 0.3 });
    }
  };

  petals.forEach((pe, order) => {
    const r = rng(rndSeed + pe.li * 97 + pe.pi * 13);
    const pts = pe.pl.map(q => [q[0], q[1]]);
    if (order > 1) {
      crayonLine(ctx, pe.pt.map(q => [q[0], q[1] - 3.5 * px]),
        { color: p.dark, width: 7, alpha: 0.42, rnd: r, px, passes: 2, gaps: 0.05, jitter: 2 });
    }
    const [bx, by] = pe.base, [tx, ty] = pe.tip;
    const plen = Math.hypot(tx - bx, ty - by) || 1;
    const ang = Math.atan2(ty - by, tx - bx);
    const tone = LAYERS[pe.li].tone + (pe.outer ? 0 : -0.14);
    crayonFill(ctx, pts, {
      pal: p, rnd: r, px, len: Math.max(8, plen / px * 0.32), spacing: 2.3, width: 2.6,
      angleAt: (x, y) => ang + Math.sin((x - bx) * 0.02 / px) * 0.25,
      shade: (x, y) => {
        const t = clamp01(((x - bx) * (tx - bx) + (y - by) * (ty - by)) / (plen * plen));
        return 0.08 + 0.62 * Math.pow(t, 0.8) + 0.45 * (pe.lum - 0.5) + tone;
      },
    });
    // 縁：明るいクレヨンで軽くなぞる（巻き返った縁が光る）
    crayonLine(ctx, pe.pt.map(q => [q[0], q[1]]), { color: mixc(p.light, p.hi, 0.35), width: 2.8, alpha: 0.5, rnd: r, px, gaps: 0.32 });
    // 輪郭：濃い色で細く
    crayonLine(ctx, [...pts, pts[0]], { color: mixc(p.line, p.dark, 0.5), width: 1.7, alpha: 0.42, rnd: r, px, passes: 1, gaps: 0.28 });
  });
  drawSpiral();


}

// ---------- 葉・茎・種 ----------
function leafPoly(x, y, ang, len, wid, n = 18) {
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const hw = wid * Math.pow(Math.sin(Math.PI * s), 0.75) * (1 - 0.25 * s);
    const ax = x + Math.cos(ang) * len * s, ay = y + Math.sin(ang) * len * s;
    const bend = Math.sin(Math.PI * s) * len * 0.06;           // ゆるく反る
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    L.push([ax + nx * (hw + bend), ay + ny * (hw + bend)]);
    R.push([ax - nx * (hw - bend), ay - ny * (hw - bend)]);
  }
  return { poly: [...L, ...R.reverse()], mid: Array.from({ length: n + 1 }, (_, i) => {
    const s = i / n, bend = Math.sin(Math.PI * s) * len * 0.06, nx = -Math.sin(ang), ny = Math.cos(ang);
    return [x + Math.cos(ang) * len * s + nx * bend, y + Math.sin(ang) * len * s + ny * bend];
  }) };
}

export function drawLeaf(ctx, x, y, ang, len, wid, seed, px) {
  if (len < 2) return;
  const r = rng(seed);
  const { poly, mid } = leafPoly(x, y, ang, len, wid);
  crayonFill(ctx, poly, {
    pal: GREEN, rnd: r, px, len: Math.max(6, len / px * 0.28), spacing: 2.4, width: 2.6,
    angleAt: (qx, qy) => ang + (((qx - x) * -Math.sin(ang) + (qy - y) * Math.cos(ang)) > 0 ? -0.7 : 0.7),
    shade: (qx, qy) => {
      const s = clamp01(((qx - x) * Math.cos(ang) + (qy - y) * Math.sin(ang)) / len);
      const side = ((qx - x) * -Math.sin(ang) + (qy - y) * Math.cos(ang)) / wid;
      return 0.30 + 0.35 * s + 0.22 * clamp01(-side);
    },
  });
  crayonLine(ctx, mid.slice(1, -2), { color: GREEN.hi, width: 1.8, alpha: 0.7, rnd: r, px, passes: 1, gaps: 0.1 });
  const nx = -Math.sin(ang), ny = Math.cos(ang), dx = Math.cos(ang), dy = Math.sin(ang);
  for (let k = 1; k <= 4; k++) {
    const sk = k / 5.2, [mx, my] = mid[Math.round(sk * (mid.length - 1))];
    const hw = wid * Math.pow(Math.sin(Math.PI * sk), 0.75) * (1 - 0.25 * sk) * 0.72;
    for (const side of [1, -1]) {
      crayonLine(ctx, [[mx, my], [mx + nx * hw * side * 0.5 + dx * hw * 0.35, my + ny * hw * side * 0.5 + dy * hw * 0.35],
                       [mx + nx * hw * side + dx * hw * 0.8, my + ny * hw * side + dy * hw * 0.8]],
        { color: GREEN.dark, width: 1.5, alpha: 0.62, rnd: r, px, passes: 1, gaps: 0 });
    }
  }
  crayonLine(ctx, [...poly, poly[0]], { color: GREEN.line, width: 1.6, alpha: 0.55, rnd: r, px, passes: 1 });
}

export function drawStem(ctx, pts, width, seed, px) {
  const r = rng(seed);
  crayonLine(ctx, pts, { color: GREEN.dark, width, alpha: 0.85, rnd: r, px, passes: 2, gaps: 0.0, jitter: 0.8 });
  crayonLine(ctx, pts, { color: GREEN.base, width: width * 0.7, alpha: 0.8, rnd: r, px, passes: 2, gaps: 0.05, jitter: 0.8 });
  crayonLine(ctx, pts.map(([x, y]) => [x - width * 0.22 * px, y]), { color: GREEN.light, width: width * 0.25, alpha: 0.7, rnd: r, px, passes: 1, gaps: 0.25 });
}

export function drawSeed(ctx, x, y, w, h, seed, px) {
  const r = rng(seed);
  const poly = [];
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2;
    poly.push([x + Math.cos(a) * w, y + Math.sin(a) * h * (Math.sin(a) < 0 ? 1.12 : 0.92)]);
  }
  crayonFill(ctx, poly, {
    pal: SEED, rnd: r, px, len: 10, spacing: 2.2, width: 2.4, angle: -1.0,
    shade: (qx, qy) => 0.55 - 0.45 * (qx - x) / w - 0.25 * (qy - y) / h,
  });
  crayonLine(ctx, [...poly, poly[0]], { color: SEED.line, width: 1.8, alpha: 0.6, rnd: r, px, passes: 1 });
}

/** 舞い散る花びら 1 枚。(x, y) が中心、size = 長さ（px） */
export function drawPetal(ctx, x, y, size, pal, seed) {
  const r = rng(seed), px = Math.max(1, size / 60), poly = [];
  for (let i = 0; i < 30; i++) {
    const a = i / 30 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const wide = 0.30 * (1 + 0.62 * s) * (1 + 0.06 * Math.sin(a * 3 + seed));   // 上が広く、付け根が細い
    const notch = 1 - 0.10 * Math.exp(-Math.pow((a - Math.PI * 1.5) / 0.28, 2));  // 先端の小さなくぼみ
    poly.push([x + c * wide * size, y + s * size * 0.5 * notch * -1]);
  }
  crayonFill(ctx, poly, {
    pal, rnd: r, px, len: Math.max(6, size / px * 0.3), spacing: 2.2, width: 2.6, angle: 1.3,
    shade: (qx, qy) => 0.62 + 0.4 * (qy - y) / size - 0.3 * (qx - x) / size,
  });
  crayonLine(ctx, [...poly, poly[0]], { color: pal.line, width: 1.5, alpha: 0.35, rnd: r, px, passes: 1, gaps: 0.3 });
}

// ---------- 発芽 ----------
/* 双子葉の発芽（地上子葉型）の順序どおりに描く。t = 0〜1
   吸水してふくらむ → 種皮に割れ目 → 種皮が割れて開く →
   胚軸がかぎ状に曲がったまま出てくる → かぎがまっすぐに起きる → 閉じた双葉がパッと開く */

/** 種皮。(x, y) が種の中心、h = 種の高さ。ふくらみ・割れ目・左右に開く殻までを描く */
export function drawSeedShell(ctx, x, y, h, t, seed) {
  const px = Math.max(1, h / 50), r = rng(seed);
  const w = h * 0.38, ht = h * 0.5;
  const swell = smooth(0, 0.16, t), crack = smooth(0.14, 0.30, t), split = smooth(0.28, 0.50, t);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 60) * 0.05 * crack * (1 - split));   // 割れる直前に小さく震える
  ctx.scale(1 + 0.14 * swell, 1 + 0.10 * swell);
  if (split <= 0) {
    drawSeed(ctx, 0, 0, w, ht, seed, px);
    if (crack > 0) {                                            // 上の端から入るギザギザの割れ目
      const q = [];
      for (let i = 0; i <= 7; i++) {
        const k = i / 7;
        q.push([(i % 2 ? 1 : -1) * w * 0.09 * (i ? 1 : 0), -ht * 1.1 + ht * 1.6 * crack * k]);
      }
      crayonLine(ctx, q, { color: SEED.line, width: 2.4, alpha: 0.9, rnd: r, px, passes: 2 });
    }
  } else {
    [-1, 1].forEach(sd => {
      const poly = [];
      for (let i = 0; i <= 14; i++) {
        const a = -Math.PI / 2 + i / 14 * Math.PI;
        poly.push([sd * Math.cos(a) * w, Math.sin(a) * ht * (Math.sin(a) < 0 ? 1.12 : 0.92)]);
      }
      const seam = [];
      for (let i = 1; i < 7; i++) seam.push([sd * (i % 2 ? 0.1 : -0.02) * w, ht * 0.92 - ht * 2.04 * i / 7]);
      ctx.save();
      ctx.translate(sd * w * 0.22 * split, ht * 0.8);
      ctx.rotate(sd * 0.72 * split);
      ctx.translate(0, -ht * 0.8);
      const outline = [...poly, ...seam];
      crayonFill(ctx, outline, {
        pal: SEED, rnd: r, px, len: 9, spacing: 2.2, width: 2.4, angle: -1.0,
        shade: (qx, qy) => 0.5 - 0.4 * sd * qx / w - 0.25 * qy / ht,
      });
      crayonLine(ctx, poly, { color: SEED.line, width: 1.8, alpha: 0.6, rnd: r, px, passes: 1 });
      crayonLine(ctx, [poly[0], ...seam.slice().reverse(), poly[poly.length - 1]], { color: SEED.light, width: 2, alpha: 0.75, rnd: r, px, passes: 1 });
      ctx.restore();
    });
  }
  ctx.restore();
}

/** 胚軸・双葉。(x, y) が種の中心。o = { h: 種の高さ, S: 株の倍率, len: 茎の最後の長さ } */
export function drawSeedling(ctx, x, y, t, o, seed) {
  const r = rng(seed), S = o.S, px = Math.max(1, S * 1.6), ht = o.h * 0.5;
  const grow = smooth(0.42, 0.80, t);
  const straight = smooth(0.68, 0.84, t), burst = clamp01((t - 0.84) / 0.16);
  ctx.save();
  ctx.translate(x, y);
  if (grow > 0) {
    // 胚軸：先端側ほど大きく曲がったかぎ形。起きるにつれて曲がりがなくなる
    const hook = 2.5 * (1 - straight), L = o.len * (0.25 + 0.75 * grow) * grow;
    const pts = [[0, ht * 0.1]];
    let px0 = 0, py0 = ht * 0.1, th = 0;
    for (let i = 1; i <= 24; i++) {
      th = hook * smooth(0.45, 1, i / 24);
      px0 += Math.sin(th) * L / 24;
      py0 -= Math.cos(th) * L / 24;
      pts.push([px0, py0]);
    }
    drawStem(ctx, pts, 13 * S / px, seed + 3, px);
    // 閉じた双葉が先端につき、最後にパッと開く（少し開きすぎてから戻る）
    const dir = th - Math.PI / 2;
    const e = burst <= 0 ? 0 : 1 - Math.cos(burst * Math.PI * 2.5) * (1 - burst) * (1 - burst);
    const spread = 0.10 + 0.98 * e, size = 0.55 + 0.45 * e;
    drawLeaf(ctx, px0, py0, dir - spread, S * 140 * size * grow, S * 60 * size * (0.55 + 0.45 * e) * grow, seed + 21, px);
    drawLeaf(ctx, px0, py0, dir + spread, S * 140 * size * grow, S * 60 * size * (0.55 + 0.45 * e) * grow, seed + 22, px);
  }
  ctx.restore();
}

// ---------- 株：任意の位置・向き・成長段階で描く ----------
/**
 * 1 株を描く。根もと (x, y) から angle（0 = 真上）の向きへ茎を伸ばす。
 * st = {
 *   S       大きさの倍率（基準 1000px の株に対する比）
 *   len     茎の長さ（px）
 *   cot     双葉 0〜1, leaf1 / leaf2  葉 0〜1, thorn  トゲ 0〜1
 *   bud     蕾の大きさ 0〜1, open  開き具合 0〜1, tilt  花を手前へ傾ける量
 *   palette 花の色, seed  株ごとの乱数の種, boil  線の震えのコマ（0〜2）
 *   side    1 / -1  葉の付く向きを左右反転
 *   cotScale 双葉の大きさの倍率（既定 1）
 *   headless true なら花を描かない（花束で花だけ別に描くとき）
 * }
 */
export function drawSprig(ctx, x, y, angle, st) {
  const S = st.S, p = st.palette || PALETTES.red;
  const px = Math.max(1, S * 1.6);
  const seed0 = (st.seed || 0) * 131 + 1000 + (st.boil || 0) * 7919;
  const stemLen = st.len, side = st.side || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // 茎の道筋：ゆるい S 字
  // droop = 咲ききった花の重みで、首が横へしなだれる量（0〜1）
  const droop = st.droop || 0;
  const stemAt = k => {
    // 下半分はまっすぐ。上半分だけが曲がり、咲ききると首が弧を描いて折れる
    const s = k / Math.max(1, stemLen), t = Math.max(0, (s - 0.5) / 0.5);
    return [side * (Math.sin(t * 2.2) * S * 12 * t + droop * stemLen * 0.22 * t * t), -k + droop * stemLen * 0.06 * t * t * t];
  };
  const stem = [];
  for (let k = 0; k <= stemLen; k += Math.max(3, stemLen / 40)) stem.push(stemAt(k));
  if (stemLen > 1) stem.push(stemAt(stemLen));
  const top = stemAt(stemLen);
  const lf = a => side > 0 ? a : -Math.PI - a;   // 葉の向きを左右反転

  if ((st.leaf1 || 0) > 0.01) {
    const [lx, ly] = stemAt(stemLen * 0.34);
    drawLeaf(ctx, lx, ly, lf(-2.55), S * 190 * st.leaf1, S * 62 * st.leaf1, seed0 + 11, px);
  }
  if (stemLen > 2) {
    drawStem(ctx, stem, 13 * S / px, seed0 + 3, px);
    const th = st.thorn || 0;
    if (th > 0.01) [[0.22, 1], [0.47, -1], [0.72, 1]].forEach(([h, sd], i) => {
      sd *= side;
      const [tx, ty] = stemAt(stemLen * h), L = S * 13 * th;
      const tri = [[tx + sd * S * 4, ty - L * 0.7], [tx + sd * (S * 5 + L), ty + L * 0.15], [tx + sd * S * 4, ty + L * 0.35]];
      crayonFill(ctx, tri, { pal: GREEN, rnd: rng(seed0 + 41 + i), px, len: 6, spacing: 2, width: 2, angle: 0.4, shade: () => 0.25, accent: 0 });
    });
  }
  if ((st.leaf2 || 0) > 0.01) {
    const [lx, ly] = stemAt(stemLen * 0.56);
    drawLeaf(ctx, lx, ly, lf(-0.62), S * 170 * st.leaf2, S * 56 * st.leaf2, seed0 + 12, px);
  }
  if ((st.cot || 0) > 0.01) {
    const cs = st.cot * (st.cotScale || 1);
    drawLeaf(ctx, top[0], top[1], -2.65, S * 70 * cs, S * 30 * cs, seed0 + 21, px);
    drawLeaf(ctx, top[0], top[1], -0.49, S * 70 * cs, S * 30 * cs, seed0 + 22, px);
  }
  const bud = st.bud || 0, open = st.open || 0;
  if (bud > 0.01 && !st.headless) {
    // 花と萼は首の先ごと傾け、しなだれるほど花の正面をこちらへ向ける
    ctx.save();
    ctx.translate(top[0], top[1]);
    ctx.rotate(side * droop * 0.45);
    for (let i = 0; i < 4; i++) {
      const ang = -Math.PI / 2 + (i - 1.5) * 0.75;
      drawLeaf(ctx, 0, -S * 4, ang + (i < 2 ? -0.5 : 0.5) * (0.6 + 0.6 * open),
               S * 60 * bud, S * 14 * bud, seed0 + 31 + i, px);
    }
    drawRose(ctx, 0, -S * 6, S * 380 * bud, open, p, seed0 + 101, px, st.tilt ?? (0.30 * open + 0.60 * droop));
    ctx.restore();
  }
  ctx.restore();
  return top;
}

/** 種。(x, y) が中心、h = 高さ（px） */
export function drawSeedAt(ctx, x, y, h, rot, seed) {
  const px = Math.max(1, h / 50);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  drawSeed(ctx, 0, 0, h * 0.38, h * 0.5, seed, px);
  ctx.restore();
}

/** 満開の薔薇の頭を 1 つ、透明なキャンバスに描いておく（花束で何度も使う）。
 *  size = 花の幅のおよそ（px）。face = 正面を向く量（0 = 横から, 1 = 上から） */
export function roseSprite(size, palette, seed, boil = 0, face = 0.55, open = 0.9) {
  const cv = document.createElement('canvas');
  const unit = size / 0.9;
  cv.width = Math.ceil(size * 1.5);
  cv.height = Math.ceil(size * 1.5);
  const g = cv.getContext('2d');
  // 付け根の位置：正面を向くほど花の中心が付け根に近づく
  const by = cv.height * (0.5 + 0.38 * (1 - face));
  drawRose(g, cv.width / 2, by, unit, open, palette, seed * 131 + boil * 7919, Math.max(1, size / 140), face);
  return { canvas: cv, ox: cv.width / 2, oy: cv.height * 0.5 };
}

/** 束ねるリボン。(x, y) が結び目、w = 幅 */
export function drawRibbon(ctx, x, y, w, seed, pal) {
  const r = rng(seed), px = Math.max(1, w / 120);
  const h = w * 0.16;
  const band = [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2 + h * 0.1], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2 + h * 0.08]];
  crayonFill(ctx, band, { pal, rnd: r, px, len: 12, spacing: 2.2, width: 2.6, angle: 0.15, shade: (qx, qy) => 0.5 - (qy - y) / h * 0.5 });
  const loop = s => {
    const q = [];
    for (let i = 0; i <= 20; i++) {
      const a = i / 20 * Math.PI * 2;
      q.push([x + s * (w * 0.20 + Math.cos(a) * w * 0.18), y - h * 0.2 + Math.sin(a) * w * 0.12 - Math.cos(a) * s * w * 0.04]);
    }
    return q;
  };
  for (const s of [-1, 1]) {
    const q = loop(s);
    crayonFill(ctx, q, { pal, rnd: r, px, len: 10, spacing: 2.2, width: 2.4, angle: s * 0.6, shade: () => 0.55 });
    crayonLine(ctx, q, { color: pal.line, width: 1.6, alpha: 0.6, rnd: r, px, passes: 1 });
  }
  for (const s of [-1, 1]) {
    const tail = [[x, y], [x + s * w * 0.08, y + w * 0.3], [x + s * w * 0.18, y + w * 0.28], [x + s * w * 0.05, y]];
    crayonFill(ctx, tail, { pal, rnd: r, px, len: 10, spacing: 2.2, width: 2.4, angle: 1.3, shade: () => 0.4 });
  }
  drawSeed(ctx, x, y - h * 0.1, w * 0.06, w * 0.07, seed + 5, px);
}
export const PAPER = pal({ dark: '#9C7650', base: '#D2AE80', light: '#E8CFA8', hi: '#F7EAD2', line: '#7A5A3A', accent: '#E3A08A' });
export const PAPER_IN = pal({ dark: '#C9B79A', base: '#EFE4CF', light: '#F8F1E3', hi: '#FFFFFF', line: '#A8977C', accent: '#F0C6B8' });

/** 包み紙（後ろ）。花の後ろに広がり、両脇と上の縁が花のあいだからのぞく。
 *  (cx, cy) = 花束の中心, R = 花束の半径。座標は R を単位にした比で決めてある */
export function drawWrapBack(ctx, cx, cy, R, seed) {
  const r = rng(seed), px = Math.max(1, R / 220);
  const P = (x, y) => [cx + x * R, cy + y * R];
  const pts = [P(0, 1.25)];
  for (let i = 0; i <= 24; i++) {                // 左下 → 上の波打つ縁 → 右下
    const t = i / 24, a = Math.PI * (1.08 - 1.16 * t);
    const wave = 1 + 0.06 * Math.sin(t * Math.PI * 7);
    pts.push(P(Math.cos(a) * 1.12 * wave, -0.05 - Math.sin(a) * 1.02 * wave));
  }
  crayonFill(ctx, pts, {
    pal: PAPER_IN, rnd: r, px, len: Math.max(10, R * 0.22 / px), spacing: 2.6, width: 3,
    angleAt: (x, y) => Math.atan2(y - (cy + 1.25 * R), x - cx),
    shade: (x, y) => 0.55 + 0.25 * (cy - y) / R,
  });
  crayonLine(ctx, [...pts, pts[0]], { color: PAPER_IN.line, width: 1.8, alpha: 0.5, rnd: r, px, passes: 1, gaps: 0.2 });
}

/** 包み紙（前）。花束の下半分を V 字に包む。茎の根もとはこの下に隠れる */
export function drawWrapFront(ctx, cx, cy, R, seed) {
  const r = rng(seed), px = Math.max(1, R / 220);
  const P = (x, y) => [cx + x * R, cy + y * R];
  const tip = P(0, 1.28);
  const rim = [];
  for (let i = 0; i <= 20; i++) {                 // 左 → 中央で少し下がる → 右
    const t = i / 20, x = -1 + 2 * t;
    rim.push(P(x * 0.98, 0.16 + 0.24 * (1 - x * x) + 0.025 * Math.sin(t * Math.PI * 6)));
  }
  const pts = [tip, ...rim];
  crayonFill(ctx, pts, {
    pal: PAPER, rnd: r, px, len: Math.max(10, R * 0.24 / px), spacing: 2.4, width: 3,
    angleAt: (x, y) => Math.atan2(y - tip[1], x - tip[0]),
    shade: (x, y) => 0.42 - 0.15 * (x - cx) / R + 0.18 * (cy + 0.3 * R - y) / R,
  });
  // 紙の折り目と、縁の明るい返し
  crayonLine(ctx, [P(-0.32, 0.36), P(-0.1, 0.9), tip], { color: PAPER.dark, width: 2.2, alpha: 0.55, rnd: r, px, passes: 1, gaps: 0.1 });
  crayonLine(ctx, [P(0.42, 0.33), P(0.16, 0.92), tip], { color: PAPER.dark, width: 2.0, alpha: 0.45, rnd: r, px, passes: 1, gaps: 0.15 });
  crayonLine(ctx, rim, { color: PAPER.hi, width: 3, alpha: 0.7, rnd: r, px, gaps: 0.15 });
  crayonLine(ctx, [...pts, pts[0]], { color: PAPER.line, width: 1.8, alpha: 0.55, rnd: r, px, passes: 1, gaps: 0.18 });
}

export const RIBBON = pal({ dark: '#A38B62', base: '#D8C49B', light: '#EFE3C6', hi: '#FBF5E6', line: '#7E6844', accent: '#E9A9A0' });

// ---------- 確認用：1 株の成長を t = 0（種）〜 1（満開）で描く ----------
export function stagesAt(t) {
  return {
    seedVis: 1 - smooth(0.12, 0.2, t),
    sprout: easeBack((t - 0.07) / 0.12),
    grow: smooth(0.2, 0.5, t),
    cot: easeBack((t - 0.11) / 0.1) * (1 - smooth(0.44, 0.54, t)),
    leaf1: easeBack((t - 0.28) / 0.1), leaf2: easeBack((t - 0.35) / 0.1),
    thorn: smooth(0.4, 0.5, t),
    bud: easeBack((t - 0.44) / 0.1),
    open: 0.9 * smooth(0.56, 0.92, t),      // 開ききらず、カップ形で止める
  };
}

export function drawPlant(ctx, W, H, t, o = {}) {
  const S = (o.size || H) / 1000;
  const cx = o.x ?? W / 2, gy = o.ground ?? H * 0.93;
  const g = stagesAt(t);
  if (g.seedVis > 0.01) {
    const wob = Math.sin(t * 120) * 0.08 * smooth(0.02, 0.07, t) * (1 - smooth(0.09, 0.12, t));
    ctx.save();
    ctx.translate(cx, gy - S * 26);
    ctx.scale(g.seedVis, g.seedVis);
    drawSeedAt(ctx, 0, 0, S * 80, wob, 1000 + (o.boil || 0) * 7919 + 1);
    ctx.restore();
  }
  const len = S * (70 * g.sprout + 520 * g.grow);
  const sway = Math.sin(t * 9) * 0.04 * g.grow;
  drawSprig(ctx, cx, gy, sway, { ...g, S, len, palette: o.palette, boil: o.boil });
}

/** 描き終えたレイヤーに紙目を重ねる（塗った部分だけ、クリーム色にかすれる） */
export function applyGrain(g, pattern, w, h, amount = 0.62) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = amount;
  g.fillStyle = pattern;
  g.fillRect(0, 0, w, h);
  g.restore();
}

// ---------- 描画の仕組み：レイヤーに描いて紙目を重ね、画面へ ----------
export function createCrayonStage(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d');
  const grain = makeGrain(256);
  let pattern = null, W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.round(canvas.clientWidth * dpr);
    H = Math.round(canvas.clientHeight * dpr);
    canvas.width = layer.width = W;
    canvas.height = layer.height = H;
    pattern = lctx.createPattern(grain, 'repeat');
    if (pattern.setTransform) pattern.setTransform(new DOMMatrix().scale(dpr * 0.6));
  }
  resize();

  function render(t, o = {}) {
    lctx.clearRect(0, 0, W, H);
    drawPlant(lctx, W, H, t, { ...opts, ...o });
    applyGrain(lctx, pattern, W, H);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(layer, 0, 0);
  }
  return { render, resize, get size() { return [W, H]; } };
}
