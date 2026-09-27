import { Wt, Kr, x6, L3, Ji, Gt, ai } from './engine.js';

// —— 简谐弹簧（真实引擎用的就是这套：me.x / me.v / me.t）——
class Spring {
  constructor(t = 0, k = 0.18, d = 0.72) { this.x = 0; this.v = 0; this.t = t; this.k = k; this.d = d; }
  step() {
    this.v += (this.t - this.x) * this.k;
    this.v *= this.d;
    this.x += this.v;
    return this.x;
  }
}

const SPR = {
  V: new Spring(0), N: new Spring(0), J: new Spring(0), ce: new Spring(1),
};

let cur = 0;          // 当前眼睛索引
let prev = null;      // 过渡起点
let prog = 1;         // 过渡进度 0..1
let t0 = 0;           // 状态进入时刻
let state = 'idle';
let frame = 0;

const W = 420, H = 420;

function pick(seq) {
  // Kr[state] 是眼睛索引序列，按节奏循环
  const per = state === 'excited' ? 0.32 : state === 'surprised' ? 0.55 : 0.75;
  return seq[Math.floor((performance.now() / 1000 - t0) / per) % seq.length];
}

function setState(s) {
  state = s; t0 = performance.now() / 1000;
  frame = 0;
  SPR.V.t = 0; SPR.N.t = 0; SPR.J.t = 0; SPR.ce.t = 1;
  blinkAt = performance.now() / 1000 + 1.5 + Math.random() * 3;
}

let blinkAt = 2.5, blinking = 0, blinkStart = 0;

function animate() {
  const seq = Kr[state] || [0];
  const now = performance.now() / 1000;
  const A = now - t0;

  // 眨眼：idle 时插入
  if (state === 'idle' || state === 'listening') {
    if (now > blinkAt && blinking === 0) { blinking = 1; blinkStart = now; }
    if (blinking === 1 && now - blinkStart > 0.12) blinking = 2;
    if (blinking === 2 && now - blinkStart > 0.24) { blinking = 0; blinkAt = now + 2 + Math.random() * 4; }
  }
  let target;
  if (blinking === 1) target = 4;        // 眯眼
  else if (blinking === 2) target = 13;  // 更扁
  else target = pick(seq);

  if (target !== cur) { prev = cur; cur = target; prog = 0; }
  prog = Math.min(1, prog + 0.14);

  // —— 每状态动画（照搬真实 case 分支的形制）——
  let z = 1;
  switch (state) {
    case 'sleeping': {
      const E = Math.min(A / 2, 1);
      const ie = Math.sin(Math.min(A / .5, 1) * Math.PI);
      SPR.V.t = 4 * E + Math.sin(A * .25) * 2;
      SPR.J.t = -2 * E;
      SPR.N.t = 8 * E + Math.sin(A * .55) * 3 - ie * 5;
      SPR.ce.t = 1 + Math.sin(A * .55) * .016 + ie * .05;
      break;
    }
    case 'idle': {
      SPR.V.t = Math.sin(A * .5) * 1.5 + Math.sin(A * .17) * .6;
      SPR.J.t = Math.sin(A * .27) * 1;
      SPR.N.t = Math.sin(A * .85) * 1.2;
      SPR.ce.t = 1 + Math.sin(A * .85) * .007;
      break;
    }
    case 'listening': {
      SPR.V.t = 8 + Math.sin(A * .5) * 1.5;
      SPR.N.t = Math.sin(A * .7) * 1.5;
      SPR.ce.t = 1 + Math.sin(A * 1.2) * .01;
      break;
    }
    case 'excited': {
      const E = A * 2.2 % 1, ie = Math.sin(E * Math.PI);
      SPR.N.t = -ie * 10 + 2;
      SPR.ce.t = E < .1 ? .92 : E < .3 ? 1.05 : 1;
      SPR.J.t = Math.sin(A * 1.1) * 4;
      z = 1.06;
      SPR.V.t = Math.sin(A * Math.PI * 2 * 1.1) * 7;
      break;
    }
    case 'surprised': {
      const E = Math.min(A / 1.2, 1);
      SPR.J.t = -4 * (1 - E);
      SPR.N.t = -8 * (1 - E);
      SPR.ce.t = A < .2 ? 1.08 : 1;
      z = 1.15 - E * .08;
      SPR.V.t = 0;
      break;
    }
    case 'happy': {
      const E = Math.sin(A * 3);
      SPR.N.t = -Math.abs(E) * 4;
      SPR.J.t = Math.sin(A * 2) * 2;
      z = 1.02;
      break;
    }
    case 'laughing': {
      const E = A * 3.4 % 1, ie = Math.sin(E * Math.PI);
      SPR.N.t = -ie * 14;
      SPR.J.t = Math.sin(A * 6) * 3;
      SPR.ce.t = 1 + ie * .07;
      z = 1.04;
      break;
    }
    case 'angry': {
      SPR.N.t = Math.sin(A * 12) * 1.2;
      SPR.J.t = Math.sin(A * 9) * 1.5;
      z = 1.03;
      SPR.V.t = 0;
      break;
    }
    case 'sad': {
      SPR.N.t = 2 + Math.sin(A * .8) * 1;
      SPR.J.t = -1.5;
      SPR.ce.t = .99;
      break;
    }
    case 'drowsy': {
      const E = A * .5 % 1, ie = Math.sin(E * Math.PI);
      SPR.N.t = 3 + ie * 4;
      SPR.J.t = Math.sin(A * .4) * 2;
      SPR.ce.t = 1 - ie * .03;
      break;
    }
    case 'bored': {
      SPR.N.t = 3 + Math.sin(A * .6) * 1.5;
      SPR.J.t = Math.sin(A * .35) * 2.5;
      SPR.ce.t = .99;
      break;
    }
    case 'suspicious': {
      SPR.J.t = Math.sin(A * 1.4) * 2;
      SPR.V.t = Math.sin(A * .8) * 3;
      z = 1.02;
      break;
    }
    case 'confused': {
      SPR.J.t = Math.sin(A * 1.1) * 4;
      SPR.N.t = Math.sin(A * .9) * 2;
      z = 1.01;
      break;
    }
    case 'curious': {
      SPR.J.t = Math.sin(A * 1.3) * 3;
      SPR.V.t = Math.sin(A * .7) * 4;
      z = 1.03;
      break;
    }
    case 'playful': {
      const E = A * 2.6 % 1, ie = Math.sin(E * Math.PI);
      SPR.J.t = Math.sin(A * 2.2) * 3;
      SPR.N.t = -ie * 5;
      z = 1.03;
      break;
    }
    case 'proud': {
      SPR.N.t = -3 + Math.sin(A * .9) * 1;
      z = 1.05;
      SPR.J.t = Math.sin(A * .6) * 1;
      break;
    }
    case 'shy': {
      SPR.N.t = 2 + Math.sin(A * 1.1) * 1;
      SPR.J.t = Math.sin(A * .9) * 2;
      SPR.V.t = -4;
      SPR.ce.t = .99;
      break;
    }
    case 'scared': {
      const E = A * 11 % 1;
      SPR.J.t = (Math.random() - .5) * 3;
      SPR.N.t = Math.sin(A * 13) * 1.5;
      SPR.ce.t = 1 + Math.sin(A * 13) * .015;
      z = 1.05;
      SPR.V.t = 0;
      break;
    }
    case 'celebrate': {
      const E = A * 2 % 1, ie = Math.sin(E * Math.PI);
      SPR.N.t = -ie * 12;
      SPR.J.t = Math.sin(A * 4) * 5;
      z = 1.08;
      SPR.V.t = Math.sin(A * 3) * 5;
      break;
    }
    case 'thinking': {
      SPR.J.t = Math.sin(A * .9) * 2;
      SPR.V.t = Math.sin(A * .6) * 6;
      SPR.N.t = -2 + Math.sin(A * .8) * 2;
      break;
    }
    case 'searching': {
      SPR.V.t = Math.sin(A * 1.8) * 12;
      SPR.N.t = Math.sin(A * 1.3) * 3;
      SPR.J.t = Math.sin(A * 1.5) * 2;
      break;
    }
    case 'waking': {
      const E = Math.min(A / .75, 1);
      SPR.N.t = 4 - 10 * E;
      SPR.ce.t = 1.02;
      break;
    }
    default: {
      SPR.V.t = Math.sin(A * .6) * 2;
      SPR.N.t = Math.sin(A * .8) * 1.5;
      break;
    }
  }

  for (const s of Object.values(SPR)) s.step();

  // —— 取形：ji 插值 ——
  let polys;
  if (prev !== null && prog < 1) {
    const a = Wt[prev], b = Wt[cur];
    polys = [Ji(a[0], b[0], ease(prog)), Ji(a[1], b[1], ease(prog))];
  } else {
    polys = Wt[cur];
  }

  // —— 应用 x6 静态情绪缩放 + 弹簧位移 ——
  const p = x6[state] || {};
  const sc = (v, d) => (v === undefined ? d : v);
  const gx = sc(p.gap, 1), sz = sc(p.size, 1);
  const ew = sc(p.eyeWidth, 1), eh = sc(p.eyeHeight, 1);

  render(polys, { gx, sz, ew, eh, z, V: SPR.V.x, N: SPR.N.x, J: SPR.J.x, ce: SPR.ce.x });
  requestAnimationFrame(animate);
}

const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function render(polys, P) {
  const svg = document.getElementById('stage');
  const cx = W / 2, cy = H / 2;
  const scale = 1.05 * P.sz * P.z;

  const bodyPts = (() => {
    const pts = [];
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * Math.PI * 2;
      const r = 92;
      pts.push([Math.cos(a) * r * .96 + Math.sin(a * 2) * 2, Math.sin(a) * r * .94]);
    }
    return pts;
  })();

  let out = '';
  out += `<g transform="translate(${cx + P.V} ${cy + P.N}) rotate(${P.J}) scale(${scale})">`;
  out += `<path d="${L3(bodyPts)}" fill="url(#bd)" stroke="#5d5390" stroke-width="1.4" stroke-opacity=".55"/>`;

  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? -1 : 1;
    const ex = sign * 46 * P.gx;
    const ey = -20;
    const raw = polys[s];
    const [mx, my] = ai(raw);
    const pts = raw.map(([x, y]) => [mx + (x - mx) * P.ew, my + (y - my) * P.eh]);
    const [px, py] = ai(pts);
    const rel = pts.map(([x, y]) => [x - px, y - py]);
    const ex2 = Math.max(...rel.map(p => Math.abs(p[0])));
    const ey2 = Math.max(...rel.map(p => Math.abs(p[1])));
    const k = 0.86 / Math.max(ex2, ey2);
    out += `<g transform="translate(${ex} ${ey}) scale(${k})">`;
    out += `<path d="${L3(rel)}" fill="url(#ey)" filter="url(#gl)"/>`;
    out += `<circle r="11" fill="#0e0e18"/>`;
    out += `<circle cx="-4" cy="-4" r="3.6" fill="#fff" opacity=".9"/>`;
    out += `<circle cx="4.5" cy="4" r="1.8" fill="#fff" opacity=".45"/>`;
    out += `</g>`;
  }
  out += `</g>`;
  svg.innerHTML = out;
}

// 眼睛形状归一化到以质心为原点
function norm(pts) {
  const [cx, cy] = ai(pts);
  return pts.map(([x, y]) => [x - cx, y - cy]);
}
// eyeWidth / eyeHeight 缩放
function morph(pts, ew, eh) {
  const [cx, cy] = ai(pts);
  return pts.map(([x, y]) => [cx + (x - cx) * ew, cy + (y - cy) * eh]);
}
function circleBlob() {
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2;
    const r = 100 + Math.sin(a * 3) * 4;
    pts.push([Math.cos(a) * r, Math.sin(a) * r * .92]);
  }
  return pts;
}

const STATES = Object.keys(Kr);
const grid = document.getElementById('grid');
grid.innerHTML = STATES.map(s =>
  `<button data-s="${s}">${s}</button>`).join('');
grid.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  setState(b.dataset.s);
  [...grid.children].forEach(x => x.classList.toggle('on', x === b));
  document.getElementById('cur').textContent = b.dataset.s;
});
[...grid.children][STATES.indexOf('idle')].classList.add('on');
window.grokSetState = setState;
document.querySelector('#stage').setAttribute('viewBox', `0 0 ${W} ${H}`);
setState('idle');
animate();
