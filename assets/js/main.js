/* =========================================================
   Crehla — クレヨン版モーション
   「青い薔薇 → 種 → 芽 → 成長 → 蕾 → 開花 → 青い薔薇」をスクロールで進める。

   ・絵はすべて Canvas 2D にクレヨンの筆致で描く（crayon-rose.js）。画像は使わない。
   ・動きは二層。道の上の株はスクロールと関係なく流れ続け、
     スクロールは本文の進み具合・道の形・株の段階を決める。
   ・広い画面では、株は画面の中央より右だけを、下から上へ流れる。左は文字だけ。
   ・株と青い薔薇は、それぞれ小さなキャンバスに描き置き、毎フレームは位置と傾きだけ変えて貼る。
     描き直すのは段階か線の震えのコマが変わったときだけ（1 フレームに 2 株まで）。
   ・最後に紙目を重ね、塗った所を温かいクリーム色にかすれさせる。
   ・3D 版は main-3d.js に残してある。
   ========================================================= */
import {
  PALETTES, makeGrain, applyGrain, drawSprig, drawSeedAt, drawSeedShell, drawSeedling
} from './crayon-rose.js';
import { setupPetalReturn } from './petal-return.js?v=4';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const PARADE      = 4;     // 道に乗って流れる株の数
const LOOP_S      = 26;    // 1 株が道を端から端まで流れるのにかかる秒数
const SCROLL_PUSH = 1.0;   // スクロールしたぶん、流れを前に押す量
const T_END       = 0.80;  // 道の株が上へ抜け、最後の青い薔薇が昇り始める位置
const SEED_Y      = 2 / 3; // 種が止まる高さ（画面の上からの比）
const FLOW_START  = 0.21;  // 最初の芽が抜け始め、次の芽が下から登り始める位置
const ENTRY_SPEED = 2;     // 芽が出そろうまでの流れの速さの倍率（大きいほど次の芽が早く来る）
const SEED_FAR    = 10;    // 種が現れるときの遠さ（大きいほど遠くから来る）
const LEAN        = 0.10;  // 茎の傾き（高さに対する横のずれの比）
const BOIL_MS     = 160;   // 線の震え：このミリ秒ごとに描き直す（手描きアニメの「コマ」）
const HEAD_H      = 64;    // ヘッダー（ロゴ）の高さ。青い薔薇はこの下に収める

const PAL_DARK  = ['blue', 'sky', 'navy', 'white'].map(k => PALETTES[k]);   // 黒い背景：青を基調に、薄い青・濃い青・白を混ぜる
const MIX_DARK  = [0, 1, 3, 2, 0, 3, 1, 2];
const PAL_LIGHT = ['red', 'pink', 'yellow'].map(k => PALETTES[k]);          // 白い背景：赤・ピンク・黄色
const MIX_LIGHT = [0, 1, 2, 1, 0, 2, 2, 1];
let PAL = PAL_DARK, MIX = MIX_DARK, light = false;

/* 道の形。画面の幅・高さに対する比で、三次ベジェの4点。
   広い画面では、どの道も画面の中央より右を、下の外から上の外へ抜ける（株は下から上へ昇る）。
   p はその形が完全に現れるスクロール位置。間は形がなめらかに移り変わる。 */
const PATHS_WIDE = [
  { p: 0.20, size: 0.85, pts: [[0.60, 1.22], [0.62, 0.78], [0.86, 0.48], [0.78, -0.22]] },
  { p: 0.33, size: 0.85, pts: [[0.82, 1.22], [0.66, 0.78], [0.92, 0.36], [0.70, -0.22]] },
  { p: 0.51, size: 0.90, pts: [[0.68, 1.22], [0.90, 0.80], [0.62, 0.40], [0.84, -0.22]] },
  { p: 0.68, size: 1.00, pts: [[0.76, 1.22], [0.60, 0.72], [0.92, 0.42], [0.72, -0.22]] }
];
/* 狭い画面では文字を画面の上 1/3 に置くので、株はその下を左から右へ通す */
const PATHS_NARROW = [
  { p: 0.20, size: 0.90, pts: [[-0.30, 0.76], [0.25, 0.62], [0.70, 0.88], [1.30, 0.70]] },
  { p: 0.33, size: 1.00, pts: [[-0.30, 0.86], [0.30, 0.62], [0.70, 0.90], [1.30, 0.68]] },
  { p: 0.51, size: 0.95, pts: [[-0.30, 0.70], [0.40, 0.90], [0.65, 0.62], [1.30, 0.84]] },
  { p: 0.68, size: 1.00, pts: [[-0.30, 0.82], [0.36, 0.64], [0.66, 0.90], [1.30, 0.72]] }
];

/* ---------- 小物 ---------- */
const rnd     = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp01 = x => x < 0 ? 0 : (x > 1 ? 1 : x);
const smooth  = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const phase   = (p, a, b) => smooth((p - a) / (b - a));
const back    = x => { x = clamp01(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp    = (a, b, t) => a + (b - a) * t;

/* ---------- DOM ---------- */
const canvas   = document.getElementById('motif');
const stage    = document.querySelector('.stage');
const heroCopy = document.querySelector('.hero__lead');
const heroHint = document.querySelector('.hero__hint');
const ctx      = canvas.getContext('2d');
const layer    = document.createElement('canvas');
const lctx     = layer.getContext('2d');
const grain    = makeGrain(256);
let grainPat   = null;

/* ---------- 状態 ---------- */
let W = 0, H = 0, dpr = 1, tb = 0, fb = 0,
    clearX1 = 0, clearHalfH = 0, maxScroll = 0, narrow = false, closingTop = 0, heroTop = 0;
let msgLines = [];
let parade = [];
const germSp = { shell: document.createElement('canvas'), plant: document.createElement('canvas'), key: '' };   // 発芽の描き置き
const blue = { hero: null, end: null };   // 冒頭と最後の青い薔薇の描き置き

/* ================= 組み立て ================= */
function makePlant(i) {
  const r1 = rnd(i + 3), r2 = rnd(i + 41), r3 = rnd(i + 83), r5 = rnd(i + 173);
  return {
    i, cycle: 0, prevU: -1,
    size: 0.9 + r1 * 0.3,
    off: (i % 2 ? 1 : -1) * (0.5 + r2 * 0.5),   // 道の左右へ交互にずらし、縦に詰まって見えないようにする
    side: r2 < 0.5 ? 1 : -1,
    swayF: 0.3 + r3 * 0.35, swayP: r5 * Math.PI * 2,
    sprite: null, key: ''
  };
}

function build() {
  parade = [];
  for (let i = 0; i < PARADE; i++) parade.push(makePlant(i));
}

/* ================= レイアウト ================= */
function layout() {
  if (!window.innerWidth || !window.innerHeight) return;   // 表示領域がまだ 0 のとき（読み込み直後など）は、大きさが決まってから
  W = window.innerWidth; H = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  narrow = W < 720;
  canvas.width = layer.width = Math.round(W * dpr);
  canvas.height = layer.height = Math.round(H * dpr);
  grainPat = lctx.createPattern(grain, 'repeat');
  if (grainPat.setTransform) grainPat.setTransform(new DOMMatrix().scale(dpr * 0.6));

  tb = Math.min(W * 0.15, H * 0.12) * (narrow ? 1.1 : 1);  // 流れる株の大きさ
  fb = Math.min(W * 0.058, H * 0.046);                       // 種の大きさの基準

  const probe = document.querySelector('.msg__body');
  clearX1 = probe ? probe.getBoundingClientRect().right + 24 : W * 0.5;
  clearHalfH = Math.min(H * 0.20, 120);

  msgLines = [];
  document.querySelectorAll('.msg .line').forEach(el => {
    const rr = el.getBoundingClientRect();
    msgLines.push({ el, y: rr.top + window.scrollY + rr.height / 2, h: rr.height, cur: false });
  });
  const cb = document.querySelector('.closing__body');
  closingTop = cb ? cb.getBoundingClientRect().top + window.scrollY : 0;
  heroTop = heroCopy ? heroCopy.getBoundingClientRect().top + window.scrollY : H * 0.7;
  maxScroll = document.documentElement.scrollHeight - H;

  /* 大きさが変わったので描き置きを捨てる */
  blue.hero = blueRose(heroTop, true);
  blue.end = blueRose(closingTop - maxScroll * 0.94 - fb * 0.6);   // コピーが落ち着く位置で大きさを決める
  for (const it of parade) it.key = '';
  germSp.key = '';
}

/* 株をキャンバスに描き置く。根もとが (ox, oy) */
function renderPlant(it, st, r) {
  const w = Math.ceil((r * 4.4 + (st.droop || 0) * st.len * 0.5) * dpr), h = Math.ceil((st.len + r * 3.2) * dpr);
  let cv = it.sprite && it.sprite.canvas;
  if (!cv) cv = document.createElement('canvas');
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ox = w / dpr / 2, oy = h / dpr - r * 0.3;
  const top = drawSprig(g, ox, oy, 0, st);
  it.sprite = { canvas: cv, ox, oy, top, S: st.S };
}

/* 発芽を描き置く。殻と芽を分けておき、芽が抜けるときに別々に動かす */
function renderGerm(t, boil) {
  const r = tb, w = Math.ceil(r * 4.4 * dpr), h = Math.ceil(r * 5 * dpr);
  for (const cv of [germSp.shell, germSp.plant]) {
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cv === germSp.shell) drawSeedShell(g, r * 2.2, r * 3.6, fb * 1.8, t, 77 + boil * 7919);
    else drawSeedling(g, r * 2.2, r * 3.6, t, { h: fb * 1.8, S: r / 200, len: r * 0.9 }, 300 + boil * 7919);
  }
}

/* ================= 道 ================= */
function bez(pts, u) {
  const m = 1 - u, a = m * m * m, b = 3 * m * m * u, c = 3 * m * u * u, d = u * u * u;
  return [a * pts[0][0] + b * pts[1][0] + c * pts[2][0] + d * pts[3][0],
          a * pts[0][1] + b * pts[1][1] + c * pts[2][1] + d * pts[3][1]];
}
function currentPath(p) {
  const keys = narrow ? PATHS_NARROW : PATHS_WIDE;
  if (p <= keys[0].p) return keys[0];
  for (let k = 0; k < keys.length - 1; k++) {
    const A = keys[k], B = keys[k + 1];
    if (p <= B.p) {
      const t = smooth((p - A.p) / (B.p - A.p)), pts = [];
      for (let q = 0; q < 4; q++) pts.push([lerp(A.pts[q][0], B.pts[q][0], t), lerp(A.pts[q][1], B.pts[q][1], t)]);
      return { pts, size: lerp(A.size, B.size, t) };
    }
  }
  return keys[keys.length - 1];
}
/* 狭い画面：花の上端が画面の上 1/3 を越えたら下へ押し戻す。
   広い画面：本文の右端より左へは入らない */
function avoidText(x, top, bottom, halfW) {
  if (narrow) return [0, Math.max(0, H * 0.34 - top)];
  return [Math.max(0, clearX1 - (x - halfW)), 0];
}

/* ================= 青い薔薇 =================
   茎と葉のついた満開の 1 輪。止まって見せたいので線の震えはかけず、1 枚だけ描き置く。
   根もとがコピーの少し上、花の上端がロゴの下に来る大きさにする */
function blueRose(limitY, ring) {
  const avail = Math.max(H * 0.3, Math.min(limitY, H) - HEAD_H - 24);
  const r = Math.min(W * 0.13, avail * 0.19);
  /* 輪が画面の幅に収まらないときは、花の大きさはそのままに茎だけ短くする */
  const len = ring ? Math.min(avail - r * 3.0, (W - 20 - r * 3.1) / 0.96) : avail - r * 3.0;
  const it = {};
  renderPlant(it, {
    S: r / 200, cotScale: 2.0, len, side: 1, seed: 7, boil: 0, palette: PALETTES[light ? 'red' : 'blue'],
    cot: 0, leaf1: 1, leaf2: 1, thorn: 1, bud: 1, open: 0.95, droop: 1
  }, r);
  const sp = it.sprite;
  /* 根もとと花の中心（drawBlue の座標：茎の中点が原点）。花（半径 1.45r）と根もとをちょうど包む円を、輪にする。
     花が大きいぶん中心は花のほうへ寄り、株ぜんたいが輪の真ん中に見える */
  const head = [sp.top[0], sp.top[1] - sp.S * 6 + len / 2], root = [0, len / 2];
  const d = Math.hypot(head[0] - root[0], head[1] - root[1]), r1 = r * 1.45, r2 = r * 0.1;
  const Rin = (d + r1 + r2) / 2, k = (Rin - r1) / d;
  const mid = [head[0] + (root[0] - head[0]) * k, head[1] + (root[1] - head[1]) * k];
  const R = Math.min(Rin + r * 0.5, W / 2 - 10);   // 余白をとる。画面の幅は越えない
  return { ...sp, len, head, mid, ring: ring ? R : 0 };
}
/* 花のまわりを円で囲む文字。drawBlue と同じ (x, y, rot) を渡すと、花の中心に輪を合わせる */
const RING_SPEED = 0.12;   // 文字の輪が回る速さ（rad/秒。約 52 秒で一周。反時計回り）
const RING_EN = 'An idea is just a seed. \u00B7 Help it bloom for someone. \u00B7 ';
const RING_TEXT = RING_EN;   // 上部の円の文字は、背景が白でも英語のまま
const RING_FONT = '"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif';
function ringCenter(b, x, y, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [x + b.mid[0] * c - b.mid[1] * s, y + b.mid[0] * s + b.mid[1] * c];
}
function drawRing(b, x, y, rot, turn) {
  if (!b.ring) return;
  const [hx, hy] = ringCenter(b, x, y, rot);
  const R = b.ring, C = 2 * Math.PI * R, unit = [...RING_TEXT];
  lctx.save();
  lctx.textBaseline = 'middle';
  lctx.fillStyle = light ? '#1A1A1C' : '#F1EFEA';
  /* 輪が大きいときは、同じ文を繰り返して一周を埋める */
  const target = narrow ? 13 : 18;
  lctx.font = `400 ${target}px ${RING_FONT}`;
  const w1 = unit.reduce((a, ch) => a + lctx.measureText(ch).width, 0);
  const reps = Math.max(1, Math.floor(C * 0.9 / w1));   // 字が重ならないよう、一周の 9 割までに収める
  const chars = [];
  for (let k = 0; k < reps; k++) chars.push(...unit);
  const ws = chars.map(ch => lctx.measureText(ch).width);
  const sp = (C - ws.reduce((a, v) => a + v, 0)) / chars.length;   // 余りは字間に配って、ちょうど一周にする
  let a = -Math.PI / 2 + turn;   // turn が減ると反時計回りに回る
  chars.forEach((ch, i) => {
    const m = a + ws[i] / 2 / R;
    lctx.save();
    lctx.translate(hx + R * Math.cos(m), hy + R * Math.sin(m));
    lctx.rotate(m + Math.PI / 2);
    lctx.fillText(ch, -ws[i] / 2, 0);
    lctx.restore();
    a += (ws[i] + sp) / R;
  });
  lctx.restore();
}
/* (x, y) に茎の中点が来るように貼る */
function drawBlue(b, x, y, scale, rot) {
  const w = b.canvas.width / dpr, h = b.canvas.height / dpr;
  lctx.save();
  lctx.translate(x, y);
  lctx.rotate(rot);
  lctx.scale(scale, scale);
  lctx.drawImage(b.canvas, -b.ox, -b.oy + b.len / 2, w, h);
  lctx.restore();
}

/* ================= 円をなぞって背景を切り替える ================= */
const SVGNS = 'http://www.w3.org/2000/svg';
const hitSvg = document.createElementNS(SVGNS, 'svg');
const hit = document.createElementNS(SVGNS, 'circle');
hitSvg.setAttribute('class', 'ring-hit');
hitSvg.setAttribute('aria-hidden', 'false');
hit.setAttribute('tabindex', '0');
hit.setAttribute('role', 'button');
hit.setAttribute('aria-label', 'Trace the ring to switch the background');
hitSvg.append(hit);
document.body.append(hitSvg);
hit.style.display = 'none';

function placeHit(c, R, on = true) {
  if (!c || !on) { hit.style.display = 'none'; return; }
  hit.style.display = '';
  hit.setAttribute('cx', c[0].toFixed(1));
  hit.setAttribute('cy', c[1].toFixed(1));
  hit.setAttribute('r', R.toFixed(1));
  hit.setAttribute('stroke-width', narrow ? 44 : 56);
  hitC = c;
}
let heroHold = false, heroReveal = 1;   // 花びらが散っている間は薔薇と輪を伏せる
let hitC = [0, 0], hitLast = 0, hitAcc = 0, hitOn = false;
const angleOf = e => Math.atan2(e.clientY - hitC[1], e.clientX - hitC[0]);
hit.addEventListener('pointerdown', e => {
  hitOn = true; hitAcc = 0; hitLast = angleOf(e);
  hit.setPointerCapture(e.pointerId);
});
hit.addEventListener('pointermove', e => {
  if (!hitOn) return;
  const a = angleOf(e);
  let d = a - hitLast;
  if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
  hitLast = a; hitAcc += d;
  if (Math.abs(hitAcc) >= Math.PI * 2 * 0.92) { hitAcc = 0; setTheme(light ? 'dark' : 'light'); }
});
const hitEnd = () => { hitOn = false; hitAcc = 0; };
hit.addEventListener('pointerup', hitEnd);
hit.addEventListener('pointercancel', hitEnd);
hit.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTheme(light ? 'dark' : 'light'); }
});

/* 物語の文言：黒い背景は英語、白い背景は日本語。冒頭と最後のコピーは、どちらの背景でも英語のまま。英語は改行しない段落、日本語は行ごとに組む */
const JA_MSGS = [
  ['ある日、誰かの心のなかに、', '小さなアイデアのタネが落ちた。', 'まだ誰にも話せない、想いの一粒。', 'やがてタネは、そっと殻をやぶり、', 'はじめての芽を出した。'],
  ['生まれたばかりの芽は、まだ頼りなかった。', 'ひとりでは、うまく伸びられない。', 'けれど、そばで耳をかたむける人がいると、', '芽は少しだけ、背を伸ばした。'],
  ['想いに寄り添うこと。', 'いっしょに考え、かたちにすること。', 'アイデアとクリエイティブは、', '芽をそだてる水と光になる。', 'わたしたちは、そんな存在でありたい。'],
  ['葉を一枚ずつ重ねていくうちに、', '芽の先が、すこしずつふくらみはじめた。', 'まだ開かない。まだ、誰にも見えない。', 'けれどそのなかで、幸せの色が育っていた。'],
  ['そして、ある朝。', '蕾は、ふっとほどけた。', 'あの日の小さなアイデアが、', '誰かの想いと重なって、', '幸せの花になって、咲いていった。'],
  ['Crehlaは、人の想いに寄り添い、', 'アイデアとクリエイティブで、', '幸せの花を咲かせます。']
];
const copyBlocks = [...document.querySelectorAll('.msg__body')].map((el, i) => ({
  el, ja: JA_MSGS[i], en: [...el.querySelectorAll('.line')].map(l => l.textContent)
}));
function setCopy(ja) {
  for (const b of copyBlocks) {
    b.el.replaceChildren(...(ja ? b.ja : b.en).map((text, i) => {
      const s = document.createElement('span');
      s.className = 'line';
      s.style.setProperty('--i', i);
      s.textContent = text;
      return s;
    }));
    b.el.lang = ja ? 'ja' : 'en';
  }
}

/* 背景を黒⇄白に切り替える。花の色は黒なら青系、白なら赤・ピンク・黄色 */
function setTheme(mode) {
  light = mode === 'light';
  PAL = light ? PAL_LIGHT : PAL_DARK;
  MIX = light ? MIX_LIGHT : MIX_DARK;
  document.documentElement.dataset.theme = mode;
  setCopy(light);
  const tc = document.getElementById('theme-color');
  if (tc) tc.setAttribute('content', light ? '#FFFFFF' : '#000000');
  const logo = document.querySelector('.head__logo');
  if (logo) logo.src = light ? 'assets/img/logo-on-light.webp?v=5' : 'assets/img/logo-on-dark.webp?v=5';
  layout();   // 描き置きの花を、新しい色で描き直す
  /* 切り替わった背景に合う色の花びらを散らし、落ちきってから薔薇と文字の輪を出す */
  if (petalShow) { heroHold = true; heroReveal = 0; petalShow.burst(() => { heroHold = false; }); }
}

/* ================= 1フレーム ================= */
let flowU = 0, flowing = false;

function paint(p, time, dt, dp, boil) {
  if (!layer.width || !layer.height) return;
  /* しきい値は各セクションが画面中央に来る位置の実測値に合わせてある。
     hero 0 / msg1 .15 / msg2 .27 / msg3 .39 / msg4 .51 / msg5 .63 / msg6 .75 / closing .92 */
  const LEAVE  = phase(p, 0.02, 0.10);
  const SEED   = phase(p, 0.04, 0.11);
  const S      = phase(p, 0.11, 0.17);
  const G      = phase(p, 0.18, 0.42);
  const D      = phase(p, 0.40, 0.56);
  const B      = phase(p, 0.56, 0.72);
  const Q      = phase(p, T_END, 0.925);

  stage.style.opacity = (1 - clamp01((p - 0.965) / 0.033)).toFixed(3);
  const heroOp = (1 - clamp01((p - 0.012) / 0.05)).toFixed(3);
  if (heroCopy) heroCopy.style.opacity = heroOp;
  if (heroHint) heroHint.style.opacity = heroOp;
  paintText();

  /* 芽は 1 つずつ登る。最初の芽が抜け始めたら道を頭から流し直し、
     道の始まりを通った株から順に姿を見せる。全部出そろうまでは少し速く流す */
  const allOut = reduced || p > 0.45;
  if (p < FLOW_START) {
    flowing = false;
    for (const it of parade) { it.born = false; it.prevU = -1; }
  } else if (!flowing) {
    flowing = true;
    flowU = 0;
    parade[0].born = true;
  }
  const waiting = flowing && !allOut && parade.some(it => !it.born);
  flowU += (reduced ? 0 : dt / LOOP_S * (waiting ? ENTRY_SPEED : 1)) + Math.abs(dp) * SCROLL_PUSH;
  const path = currentPath(p);

  /* 種は遠くから手前へ近づいてきて（遠近法で、近いほど急に大きくなる）、
     画面の下から 1/3 の高さで今の大きさになったら、ぴょこっと芽を出す */
  const seedX = W * (narrow ? 0.5 : 0.72);
  const seedY = H * lerp(SEED_Y - 0.10, SEED_Y, SEED);
  const seedNear = SEED / (1 + SEED_FAR * (1 - SEED));
  const germ = clamp01((p - 0.112) / 0.075);   // 発芽の進み具合（種が止まってから）
  const cx = W / 2;

  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.clearRect(0, 0, layer.width, layer.height);
  lctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  /* 株の段階（どの株も同じ） */
  const stage0 = {
    cot:   back(S) * (1 - phase(p, 0.36, 0.46)),
    leaf1: back(phase(p, 0.22, 0.30)),
    leaf2: back(phase(p, 0.27, 0.35)),
    thorn: phase(p, 0.36, 0.42),
    bud:   back(D),
    open:  0.9 * B,
    droop: phase(p, 0.64, 0.74)              // 咲ききったら、花の重みでしなだれる
  };

  /* --- 道を流れる株 --- */
  let budget = 2;
  for (let i = 0; i < parade.length; i++) {
    const it = parade[i];
    if (p < FLOW_START || Q >= 1) continue;

    const u = (flowU + i / PARADE) % 1;
    if (it.prevU >= 0 && u < it.prevU - 0.5) { it.cycle++; it.born = true; }   // 道を一周したら色を変える
    it.prevU = u;
    if (!it.born && !allOut) continue;

    const pt = bez(path.pts, u), pn = bez(path.pts, Math.min(1, u + 0.004));
    const tx = (pn[0] - pt[0]) * W, ty = (pn[1] - pt[1]) * H, tl = Math.hypot(tx, ty) || 1;
    const r = tb * path.size * it.size;
    const x = pt[0] * W + (-ty / tl) * it.off * r * 0.6;
    const y = pt[1] * H + ( tx / tl) * it.off * r * 0.6;

    const L = r * (0.68 + 1.22 * G) * back(S);
    const sway = reduced ? 0 : Math.sin(time * it.swayF + it.swayP) * r * 0.08;
    const lean = L * LEAN * it.side / 2;        // 茎は直立させず、少し斜めに
    let hx = x + sway + lean, hy = y - L / 2;   // 頭
    let bx = x - sway * 0.3 - lean, by = y + L / 2;    // 根もと
    const push = avoidText(x, hy - r, by, r * 1.1);
    hx += push[0]; bx += push[0]; hy += push[1]; by += push[1];

    /* 最後は道の株をそのまま上へ抜けさせる */
    if (narrow) { const off = W * 1.6 * Q * Q; hx += off; bx += off; }   // 狭い画面では文字を横切らないよう右へ
    else { const lift = H * 1.5 * Q * Q; hy -= lift; by -= lift; }

    const dx = hx - bx, dy = hy - by, len = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dx, -dy);
    const st = {
      ...stage0, S: r / 200, cotScale: 2.0, len, side: it.side, seed: it.i * 17 + it.cycle * 5,
      palette: PAL[MIX[(i * 3 + 1 + it.cycle * 5) % MIX.length]], boil
    };
    /* 段階・長さ・色・震えのコマが変わったら描き直す */
    const key = [Math.round(len / 3), (st.cot * 40) | 0, (st.leaf1 * 40) | 0, (st.leaf2 * 40) | 0,
                 (st.bud * 50) | 0, (st.open * 60) | 0, (st.droop * 40) | 0, (st.thorn * 10) | 0, it.cycle, boil, Math.round(r)].join(',');
    if (!it.sprite || (key !== it.key && budget > 0)) {
      renderPlant(it, st, r);
      it.key = key;
      budget--;
    }
    const sp = it.sprite;
    lctx.save();
    lctx.translate(bx, by);
    lctx.rotate(ang);
    lctx.drawImage(sp.canvas, -sp.ox, -sp.oy, sp.canvas.width / dpr, sp.canvas.height / dpr);
    lctx.restore();
  }

  /* --- 種：止まるまでは 1 粒のまま近づいてくる --- */
  if (SEED > 0.001 && germ <= 0) {
    drawSeedAt(lctx, seedX, seedY, fb * 1.8 * seedNear, (1 - SEED) * 2.6, 77 + boil * 7919);
  }
  /* --- 発芽：割れた殻はその場で消え、芽はそのまま上へ抜ける --- */
  const rise = phase(p, 0.19, 0.26), rise2 = rise * rise;
  if (germ > 0 && rise < 1) {
    const key = [(germ * 80) | 0, boil].join(',');
    if (key !== germSp.key) { renderGerm(germ, boil); germSp.key = key; }
    const w = germSp.shell.width / dpr, h = germSp.shell.height / dpr, oy = h * 0.72;
    const shellS = 1 - phase(p, 0.178, 0.20);    // 双葉が開いたら、殻はその場で小さくなって消える
    if (shellS > 0.01) lctx.drawImage(germSp.shell, seedX - w / 2 * shellS, seedY - oy * shellS, w * shellS, h * shellS);
    /* 狭い画面では文字を横切らないよう、芽は上ではなく右へ抜ける */
    lctx.drawImage(germSp.plant, seedX - w / 2 + (narrow ? W * 1.1 * rise2 : 0), seedY - oy - (narrow ? 0 : H * 1.1 * rise2), w, h);
  }

  /* --- 青い薔薇：冒頭はそのまま上へ消え、最後は画面の下から昇ってくる --- */
  const sway = reduced ? 0 : Math.sin(time * 0.5) * 0.012;
  if (LEAVE >= 0.5) placeHit(null);
  if (LEAVE < 1) {
    /* 輪の中心を画面の中央に置き、輪を画面の縦の中央に置く */
    const rt = LEAN + sway, o = ringCenter(blue.hero, 0, 0, rt);
    const x0 = cx - o[0], y0 = H / 2 - o[1];
    lctx.save();
    if (!heroHold) heroReveal = Math.min(1, heroReveal + dt / 0.9);
    lctx.globalAlpha = (1 - smooth(LEAVE)) * smooth(heroReveal);   // 上へ流さず、その場で薄れて消える
    drawBlue(blue.hero, x0, y0, 1, rt);
    drawRing(blue.hero, x0, y0, rt, -time * RING_SPEED);
    lctx.restore();
    placeHit(ringCenter(blue.hero, x0, y0, rt), blue.hero.ring, LEAVE < 0.5 && !heroHold);
  }
  const E = phase(p, 0.83, 0.925);
  if (E > 0) {
    const ee = (1 - smooth(E)) * (1 - smooth(E));
    const y1 = closingTop - window.scrollY - fb * 0.6 - 16 - blue.end.len / 2 + H * 1.3 * ee;
    drawBlue(blue.end, cx - blue.end.len * 0.09, y1, 1, LEAN + sway);
  }

  /* --- 紙目を重ねて画面へ --- */
  applyGrain(lctx, grainPat, layer.width, layer.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(layer, 0, 0);
}

/* 本文：読んでいる行は差し色、読み終えた行は黒、これからの行は薄く。ロゴの下に来た行は消す */
function paintText() {
  const sy = window.scrollY, Rr = H * (narrow ? 0.30 : 0.52);   // 読んでいる行の高さ
  for (const ln of msgLines) {
    /* 狭い画面の本文は画面に留まる（sticky）ので、位置は毎回測る */
    let vy = ln.y - sy;
    if (narrow) { const rr = ln.el.getBoundingClientRect(); vy = rr.top + rr.height / 2; }
    /* 英語は段落ひとかたまりなので、中心ではなく最初の行が読む高さに来たところで見せる */
    const block = ln.h > 60, ahead = (block ? vy - ln.h / 2 + 18 : vy) - Rr;
    let op = ahead <= 0 ? 1 : 1 - (narrow ? 1 : 0.84) * smooth(ahead / (ln.h * 1.4));   // 狭い画面では上 1/3 より下の文字は見せない
    op *= narrow ? smooth((vy - H * 0.07) / (H * 0.04)) : smooth((vy - H * 0.05) / (H * 0.10));
    ln.el.style.opacity = op.toFixed(3);
    const cur = !narrow && !block && Math.abs(ahead) < ln.h * 0.55;
    if (cur !== ln.cur) { ln.el.classList.toggle('is-current', cur); ln.cur = cur; }
  }
}

/* ================= ループ ================= */
let last = 0, lastP = 0;
function frame(now) {
  if (!document.hidden) {
    const p = maxScroll > 0 ? clamp01(window.scrollY / maxScroll) : 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    const boil = reduced ? 0 : Math.floor(now / BOIL_MS) % 3;
    paint(p, reduced ? 0 : now / 1000, dt, p - lastP, boil);
    lastP = p;
  }
  last = now;
  requestAnimationFrame(frame);
}

/* ================= 起動 ================= */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

build();
layout();
paint(0, 0, 0, 0, 0);

window.addEventListener('resize', layout);
window.addEventListener('load', layout);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

requestAnimationFrame(frame);
const petalShow = setupPetalReturn();

document.body.classList.remove('is-loading');
document.body.classList.add('is-ready');

const reveal = document.querySelectorAll('.hero [data-reveal], .closing[data-reveal]');
if (reduced || !('IntersectionObserver' in window)) {
  reveal.forEach(el => el.classList.add('is-visible'));
} else {
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
  }, { threshold: 0.4 });
  reveal.forEach(el => io.observe(el));
}
