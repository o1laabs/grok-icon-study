// Grok Bot 角色引擎 —— 忠实移植（逐字照搬真实 app.asar 实现）
// 源: dist/renderer/assets/index.eager-platform-8I5DsuEg.js

import Wt from './data-eye-shapes.js';
import Kr from './data-state-eyes.js';
import x6 from './data-emotion-params.js';

export { Wt, Kr, x6 };

// —— ai：质心 ——
export const ai = e => {
  let t = 0, n = 0;
  for (const [r, i] of e) { t += r; n += i; }
  return [t / e.length, n / e.length];
};

// —— Jr：逐点线性插值（仅长度不匹配时的回退路径）——
export const Jr = (e, t, n) =>
  e.map(([r, i], s) => [r + (t[s][0] - r) * n, i + (t[s][1] - i) * n]);

// —— L3：点数组 → SVG path ——
export const L3 = e =>
  'M' + e.map(t => `${t[0].toFixed(2)} ${t[1].toFixed(2)}`).join('L') + 'Z';

// —— Ta：圆角形状生成器（射线与圆角矩形求交）——
export const Ta = (e, t, n, r, i, s, o = 48) => {
  const a = Math.max(0, i - s), c = -r, u = n, l = [];
  for (let d = 0; d < o; d++) {
    const h = d / o * Math.PI * 2,
          p = Math.cos(h), g = Math.sin(h),
          y = p * n + g * r, S = p * c + g * u;
    let k;
    const P = s / Math.max(Math.abs(S), 1e-6);
    if (P * Math.abs(y) <= a + 1e-6 && Number.isFinite(P)) k = P;
    else {
      const x = (y >= 0 ? 1 : -1) * a * y,
            T = Math.max(0, x * x - a * a + s * s);
      k = x + Math.sqrt(T);
    }
    l.push([e + n * (k * y) + c * (k * S), t + r * (k * y) + u * (k * S)]);
  }
  return l;
};

// —— Gt：PCA 主轴 + 半长/半宽 ——
export const Gt = e => {
  const [t, n] = ai(e);
  let r = 0, i = 0, s = 0;
  for (const [y, S] of e) {
    const k = y - t, P = S - n;
    r += k * k; i += P * P; s += k * P;
  }
  const o = e.length;
  r /= o; i /= o; s /= o;
  const a = Math.sqrt(Math.max(0, (r - i) * (r - i) + 4 * s * s)), c = (r + i + a) / 2;
  let u = 1, l = 0;
  if (Math.abs(s) > 1e-9 || Math.abs(r - i) > 1e-9) {
    u = c - i; l = s;
    const y = Math.hypot(u, l) || 1;
    u /= y; l /= y;
  } else i > r && (u = 0, l = 1);
  (l < 0 || l === 0 && u < 0) && (u = -u, l = -l);
  const d = -l, h = u;
  let p = 0, g = 0;
  for (const [y, S] of e) {
    const k = y - t, P = S - n;
    p = Math.max(p, Math.abs(k * u + P * l));
    g = Math.max(g, Math.abs(k * d + P * h));
  }
  return { cx: t, cy: n, ux: u, uy: l, halfLen: p, halfW: g };
};

// —— Ji：主轴对齐的形状插值（用插值参数重新生成形状）——
export const Ji = (e, t, n) => {
  const r = Math.max(0, Math.min(1, n));
  if (r <= 0) return e;
  if (r >= 1) return t;
  if (e.length !== t.length) return Jr(e, t, r);
  const i = Gt(e), s = Gt(t), o = Math.atan2(i.uy, i.ux);
  let a = Math.atan2(s.uy, s.ux) - o;
  for (; a > Math.PI / 2;) a -= Math.PI;
  for (; a < -Math.PI / 2;) a += Math.PI;
  const c = o + a * r,
        u = Math.cos(c), l = Math.sin(c),
        d = Math.max(.35, i.halfW + (s.halfW - i.halfW) * r),
        p = Math.max(0, i.halfLen - i.halfW) * (1 - r)
          + Math.max(0, s.halfLen - s.halfW) * r + d,
        g = i.cx + (s.cx - i.cx) * r,
        y = i.cy + (s.cy - i.cy) * r;
  return Ta(g, y, u, l, p, d, e.length);
};
