/* =========================================================
   ページを開いたときと、ページの最後で花びらを舞わせる。

   ・開いたときは幕が閉じた状態から始め、花びらが落ちきると幕が開いて本文が現れる。

   ・最下部に少しとどまると、まず幕が閉じて文字が消え、そのあとに花びらが舞う。
     リンクに触れている間は始めない。
   ・花びらは本文やフッターより手前のキャンバスに描く。1 枚ずつ描き置いて、
     毎フレームは位置・傾き・裏返りだけを変えて貼る。
   ・紙色の幕が画面を覆ったところで先頭へ移り（巻き戻しの動きは見せない）、
     花びらが落ちきってから幕が引いて、冒頭の青い薔薇と文字が現れる。
   ・動きを減らす設定では何もしない（自動でスクロールしない）。
   ========================================================= */
import { PALETTES, drawPetal } from './crayon-rose.js';

const COLORS   = ['blue', 'sky', 'navy', 'white'];
const COLORS_LIGHT = ['red', 'pink', 'yellow'];   // 白い背景のときの花びら
const VARIANTS = 3;     // 色ごとの花びらの形の数
const WAIT_MS  = 1200;  // 最下部にとどまってから舞い始めるまで
const SPAWN_S  = 1.6;   // 花びらが降り始める時間の幅
const FALL_SPEED = 1.5; // 花びらが落ちる速さの倍率
const VEIL_IN  = 0.6;   // 幕が閉じる長さ
const PETAL_AT = 0.4;   // 最下部で幕が閉じ始めてから花びらが舞い始めるまで
const VEIL_OUT = 0.8;   // 幕が開く長さ

const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

/* 先頭へ即座に戻す。CSS の scroll-behavior:smooth や、behavior:'instant' に対応しないブラウザでは、
   scrollTo がなめらかに動いて途中のセクションで止まって見えるので、いったん auto にして動かす */
function jumpToTop() {
  const root = document.documentElement, prev = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  root.scrollTop = 0;
  document.body.scrollTop = 0;
  root.style.scrollBehavior = prev;
}

export function setupPetalReturn() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

  const cv = document.createElement('canvas');
  cv.className = 'petals';
  const veil = document.createElement('div');
  veil.className = 'veil';
  document.body.append(veil, cv);
  const ctx = cv.getContext('2d');

  let timer = 0, running = false, sprites = [], spriteSize = 0, spriteTheme = '';

  function makeSprites(size, dpr) {
    const theme = document.documentElement.dataset.theme;
    if (spriteSize === size * dpr && spriteTheme === theme) return;
    spriteSize = size * dpr;
    spriteTheme = theme;
    sprites = [];
    (theme === 'light' ? COLORS_LIGHT : COLORS).forEach(name => {
      for (let v = 0; v < VARIANTS; v++) {
        const c = document.createElement('canvas');
        c.width = c.height = Math.ceil(spriteSize * 1.3);
        drawPetal(c.getContext('2d'), c.width / 2, c.height / 2, spriteSize, PALETTES[name], 40 + v * 13);
        sprites.push(c);
      }
    });
  }

  /* mode: 'intro'（開いたとき）/ 'end'（最下部）/ 'burst'（背景を切り替えたとき。幕も先頭へのジャンプもなし） */
  function play(mode, onDone) {
    const intro = mode === 'intro', burst = mode === 'burst';
    const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(38, Math.min(64, W * 0.05));
    makeSprites(size, dpr);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.display = 'block';
    const count = W < 720 ? 60 : 110, petals = [];
    for (let i = 0; i < count; i++) {
      const k = Math.random(), s = size * (0.7 + Math.random() * 0.6);
      petals.push({
        sp: sprites[Math.floor(Math.random() * sprites.length)], s,
        t0: (intro || burst ? 0 : PETAL_AT) + Math.random() * SPAWN_S / FALL_SPEED,
        x0: Math.random() * W * 1.2 - W * 0.2,
        vy: (H + s * 2) / (2.4 + k * 1.2),                 // 遠い花びらほどゆっくり
        drift: W * (0.02 + Math.random() * 0.05),          // 風で少し右へ流れる
        amp: s * (0.5 + Math.random()), f: 1.2 + Math.random() * 1.4, ph: Math.random() * 6.28,
        r0: Math.random() * 6.28, rv: (Math.random() - 0.5) * 2.4, ff: 1.6 + Math.random() * 2.4
      });
    }
    running = true;
    veil.style.opacity = intro ? 1 : 0;
    let start = 0, jumped = intro || burst, fallen = 0;   // fallen = 花びらが落ちきった秒
    const tick = now => {
      if (!start) start = now;
      const t = (now - start) / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      let alive = false;
      for (const q of petals) {
        const life = (t - q.t0) * FALL_SPEED;
        if (life < 0) { alive = true; continue; }
        const y = -q.s + q.vy * life;
        if (y > H + q.s) continue;
        alive = true;
        const x = q.x0 + q.drift * life + Math.sin(life * q.f + q.ph) * q.amp;
        const flip = Math.cos(life * q.ff + q.ph);            // 裏返りながら落ちる
        ctx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr);
        ctx.rotate(q.r0 + q.rv * life);
        ctx.scale(1, Math.max(0.22, Math.abs(flip)));
        const d = q.s * 1.3;
        ctx.drawImage(q.sp, -d / 2, -d / 2, d, d);
      }
      if (!alive && jumped && !fallen) fallen = t;
      if (intro && !fallen && window.scrollY > 0) fallen = t;   // 待たずに読み進めるなら、すぐ開ける
      if (burst) {
        if (alive) requestAnimationFrame(tick);
        else { running = false; cv.style.display = 'none'; if (onDone) onDone(); }
        return;
      }
      veil.style.opacity = ((intro ? 1 : smooth(t / VEIL_IN)) * (fallen ? 1 - smooth((t - fallen) / VEIL_OUT) : 1)).toFixed(3);
      if (!jumped && t >= VEIL_IN) {
        jumped = true;
        jumpToTop();
      }
      if (jumped && !intro && window.scrollY > 1 && +veil.style.opacity > 0.5) jumpToTop();   // 幕が閉じている間は、先頭に居続ける
      if (alive || !fallen || t < fallen + VEIL_OUT) requestAnimationFrame(tick);
      else { running = false; cv.style.display = 'none'; veil.style.opacity = 0; }
    };
    requestAnimationFrame(tick);
  }

  /* 最下部にとどまっていて、リンクに触れていなければ始める */
  function fire() {
    timer = 0;
    if (document.querySelector('.foot a:hover, .foot a:focus-visible, dialog[open]')) { check(); return; }
    play('end');
  }
  function check() {
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    if (atBottom && !timer && !running) timer = setTimeout(fire, WAIT_MS);
    else if (!atBottom && timer) { clearTimeout(timer); timer = 0; }
  }
  window.addEventListener('scroll', check, { passive: true });
  play('intro');
  /* 背景を切り替えたとき。いまの背景に合った色の花びらを散らす */
  return { burst(onDone) { if (running) { if (onDone) onDone(); } else play('burst', onDone); } };
}
