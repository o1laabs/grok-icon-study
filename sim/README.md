# 情绪模拟器 — Grok Bot 角色引擎移植

用真实 `app.asar` 里抽出的数据表和代码，跑出一个能动的角色。

## 数据从哪来

全部来自 `dist/renderer/assets/index.eager-platform-8I5DsuEg.js`：

| 文件 | 内容 | 来源符号 |
|---|---|---|
| `data-eye-shapes.js` | **25 只眼睛 × 2 多边形 × 48 点** | `Wt` |
| `data-state-eyes.js` | **39 个状态 → 眼睛索引序列** | `Kr` |
| `data-emotion-params.js` | **13 个情绪的几何缩放参数** | `x6` |

## 核心发现

### 1. 25 只眼睛覆盖 39 个状态（复用）

同一个眼睛被多个情绪共享，靠 `x6` 参数区分：

| 眼睛 | 长宽比 | 被谁用 | x6 效果 |
|---|---|---|---|
| eye2 | 2.27（halfLen 44.4 最大） | excited/happy/laughing/celebrate | `size:.74~.78` 放大 |
| eye3 | 1.30（最圆） | surprised/scared/curious | `size:.76~.84` 瞪圆 |
| eye4 | 4.09（最扁） | sad/drowsy/bored | `size:.92` 收小 = 半闭丧气 |
| eye7 | 2.69 | angry/working | `gap:1.28` 两眼拉开 = 怒视 |

**规律：`size` 越小眼睛越瞪（celebrate .74 最兴奋），`.92` 是半闭。**

### 2. `gap` 只在需要"皱眉/挑眉"的情绪里出现

有 `gap` 的只有 4 个：`angry`(1.28) `suspicious`(1.24) `confused`(1.20) `playful`(1.20)。
其余全用默认 1.0。

### 3. 眼睛索引序列 = 循环播放的帧

```js
idle: [0, 8]              // 两帧来回 = 眨眼
excited: [2, 17, 21, 3, 11]   // 五帧循环 = 兴奋乱转
searching: [15, 9, 3, 20, 12, 18]  // 六帧 = 四处张望
```

## 引擎算法（逐字照搬）

```
Kr[情绪] → 眼睛索引 → Wt[idx] 取多边形
              ↓
        Ji() PCA 主轴对齐插值
              ↓
   x6[情绪] 静态缩放 + case 每帧动画（弹簧 V/N/J/ce）
              ↓
           渲染
```

### `Ta` —— 圆角形状生成器

`Ji` 内部用它重新生成形状，不是逐点插值：

```js
// 求射线与圆角矩形的交点
if (P * |y| <= a) k = P;          // 打在直边
else k = x + sqrt(x² - a² + s²);  // 打在圆角
```

### `Ji` —— 主轴对齐插值

```js
const r = clamp(n, 0, 1);
const i = Gt(e), s = Gt(t);              // 各求 PCA 主轴
let a = atan2(s.uy,s.ux) - atan2(i.uy,i.ux);
while (a > π/2) a -= π;                   // 旋转差归一化
while (a < -π/2) a += π;
const c = o + a * r;                      // 插值角度
const d = max(.35, i.halfW + (s.halfW-i.halfW)*r);  // 宽度有下限防塌
const p = max(0,i.halfLen-i.halfW)*(1-r) + max(0,s.halfLen-s.halfW)*r + d;
return Ta(cx, cy, cos(c), sin(c), p, d, e.length);  // 重新生成
```

**三个设计要点**：
1. 旋转差归一到 ±π/2 —— 主轴双向，不归一化会绕远路
2. `halfW` 有 `.35` 下限 —— 防止插值到中间时形状塌成线
3. 用 `Ta` 重新生成而非逐点插值 —— 保证输出一定是合法的圆角形状

## 运行

```bash
cd sim && python3 -m http.server 8765
# 打开 http://localhost:8765
```

或直接看 `minis://workspace/sim/index.html`。

## 验证过的

- 25 只眼睛全部 48 点（`Ji` 的前提）
- `Kr` 引用的索引全部在 0..24 内
- **全部 39 状态的所有过渡平滑**：最大帧间位移 12.75px，无跳变
- 浏览器实测：39 按钮可点、弹簧在动、状态切换正常

## 局限（诚实说）

1. **我只移了 `Kr`/`Wt`/`x6` 和 `Ji`/`Ta`/`Gt`。** 真实引擎还有 `Kn` 里的
   `working` 态额外形变（`F3` 压扁 / `xu` 环形 / `z3`）、`Jo` 集合的 `minHalfW` 约束，
   以及身体/粒子/音效系统，这些没移植。
2. **每状态动画是照 `case` 分支的形制重写的，不是逐字抄。** 原代码有
   `te()`（缓动）、`F()`（随机区间）、`cr.burst()`（粒子）依赖，我用等效三角函数替代。
   数值意图一致，但不是我原样搬的。
3. **`eye6` 从未被任何状态引用。** 25 只用 24，可能是扫描残留或 `Kn` 内部另用。
4. **身体是我画的圆角 blob**，不是真实产品的造型（真实身体在别的模块）。
