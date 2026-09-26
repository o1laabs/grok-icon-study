# grok-icon-study 代码分析

> 分析对象：`blessonism/grok-icon-study`（329★ / 60 fork / 建于 2026-08-15 / 最后 push 2026-08-24）
> 分析时间：2026-09-26　分析方式：拉源码 + 实跑 + 对 bundle 逐符号交叉核验 + 线上 demo 运行时探针
> 本文件由 fork 方独立撰写，不代表上游作者观点。

---

## 0. 一句话结论

这是**一份质量相当高的逆向复刻研究**，不是截图描摹。它的价值不在"复刻得像"，而在于它把 xAI 那套角色引擎的**参数化结构**（39 个状态 × 25 组眼睛拓扑 × 18 个身形 × 11 色）完整地从 5.8MB 混淆 bundle 里挖出来并重新组织成可读代码。

但**解包脚本 `extract-asar.js` 有一个可复现的 off-by-one bug**，而且**"不含几何数据"的免责声明与仓库实际内容不符**。详见 §2 和 §4。

---

## 1. 仓库结构（实测 24 个文件 / 1.9MB）

```
README.md                    1,499 B   33 行
extract-asar.js              2,475 B   64 行
assets/app-icon-256.png               Dock 静态商标
assets/icon.iconset/×5                macOS 图标集
extracted/geometry-raw.js   47,538 B   ← 单行 minified，u3/Jo/snt 原样
extracted/index-UbX-y3il.js  5,795,769 B  537 行 ← 主 bundle（占全仓 96%）
extracted/onboarding-raw.js    500 B   单行
extracted/spring-raw.js        621 B   单行
extracted/state-tables-raw.js 2,805 B  单行
replica/geometry-data.js    79,269 B   9 行 ← 格式化后的 GROK_GEO
replica/grok-blob-idle.svg   2,111 B
replica/index.html          12,603 B   L1 舞台
replica/snap.mjs                       CDP 截图 harness（macOS 硬编码）
replica/src/math.js          8,674 B  247 行
replica/src/tables.js        7,312 B  133 行
replica/src/pose.js         13,415 B  409 行
replica/src/eyes.js          8,381 B  218 行
replica/src/tricks.js        3,980 B  115 行
replica/src/fx.js           39,697 B  908 行
replica/src/character.js    30,595 B  857 行
```

**结构判断**：`extracted/` 是"原料"（原样抄出来的 minified 片段），`replica/src/` 是"重写的成品"（拆成 7 个模块）。`extract-asar.js` 是原料来源的工具。

---

## 2. ⚠️ `extract-asar.js` 解包逻辑：有一个可复现的 off-by-one

### 2.1 脚本怎么工作

它手写 asar 头解析（不依赖 `asar` npm 包），64 行：

```js
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const pickleSize = head.readUInt32LE(4);
const strLen     = head.readUInt32LE(12);

const jsonBuf = Buffer.alloc(strLen);
fs.readSync(fd, jsonBuf, 0, strLen, 16);   // JSON 从 offset 16 开始
const header = JSON.parse(jsonBuf.toString('utf8'));
const dataStart = 16 + strLen + 1;          // ← 问题在这里
```

注释里写的布局是：
```
[4B: 4][4B: pickleSize][4B: strLen+5][4B: strLen][JSON @16][1B: \0][数据...]
```

**这个布局漏了 Chromium Pickle 的 4 字节对齐 padding。**

真实 asar 文件头是：

| 偏移 | 内容 |
|---|---|
| 0 | `u32 = 4`（Chromium Pickle 固定头） |
| 4 | `u32 = pickleSize` |
| 8 | `u32 = 4`（header 长度字段大小） |
| 12 | `u32 = strLen`（JSON 字节数） |
| 16 | JSON |
| 16+strLen | **padding，补到 4 字节对齐** |
| ↑ | 0 终止符（其实这个 \0 也在 pickle 语义里） |
| dataStart | 文件数据 |

所以正确值是 `16 + strLen + pad + 1`，其中 `pad = (4 - (strLen % 4)) % 4`，**`pad ∈ {0,1,2,3}`**。

### 2.2 实跑验证：4 个 padding 取值，**3/4 产出损坏文件**

我写了个最小复现脚本（`repro2.mjs`，见 §2.5），构造 **spec-correct** 的 asar，让 header JSON 长度分别取 `strLen ∈ {100,101,102,103}`（即 `pad = (4 - strLen%4) % 4 ∈ {0,3,2,1}` 四种情况全覆盖），载荷固定为 8 字节 `PAYLOAD!`：

```js
// 文件布局：[u32 outer=4][u32 payloadSize][u32 hdrSize=4][u32 strLen][JSON][pad][载荷]
const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(j.length);
let inner = Buffer.concat([lenBuf, j]);
const pad = (4 - (inner.length % 4)) % 4;      // ← Chromium Pickle 的 4 字节对齐
inner = Buffer.concat([inner, Buffer.alloc(pad)]);
```

**未修改的 `extract-asar.js` 实跑结果：**

| `strLen` | `pad` | 脚本算出 `dataStart` | 正确值 | 提取出的内容 | |
|---|---|---|---|---|---|
| 100 | 0 | **117** | 116 | `"AYLOAD!\u0000"` | ❌ |
| 101 | 3 | **118** | 120 | `"\u0000\u0000PAYLOA"` | ❌ |
| 102 | 2 | **119** | 120 | `"\u0000PAYLOAD"` | ❌ |
| 103 | 1 | **120** | 120 | `"PAYLOAD!"` | ✅ |

```
3/4 cases corrupted
```

**四分之三的情况静默产出损坏文件，且不报错。**

### 2.3 根因：`+1` 是错的对齐补偿

脚本的 `dataStart = 16 + strLen + 1`，那个 `+1` 显然是作者**看到文件里 JSON 后面跟着一个 `0x00`，就当成"1 字节 null 终止符"**。

但那个 `0x00` **不是终止符，是 Chromium Pickle 的 4 字节对齐 padding**。Pickle 语义里：

- 字符串按 `[u32 len][bytes]` 存储，**没有 null 终止符**
- 存储后会把整个 pickle **补到 4 字节边界**，补 `0~3` 个 `0x00`
- `strLen % 4 == 0` 时**一个都不补**

所以正确的 `dataStart = 16 + strLen + ((4 - strLen % 4) % 4)`。

**当 `strLen % 4 == 3` 时，`pad == 1`，那个 `+1` 恰好命中 —— 这就是作者为什么以为自己是对的。** 单样本验证 + 巧合正确，是最难发现的 bug 形态。

### 2.4 修法（1 行）与验证

```js
// 原：const dataStart = 16 + strLen + 1;
const dataStart = 16 + strLen + ((4 - (strLen % 4)) % 4);
```

⚠️ **注意 JS 的 `%` 保留符号**：`(-101) % 4 === -1`，不是 `3`。所以**不能**写 `strLen + ((-strLen) % 4)`（我第一次就是这么写的，4 个用例仍然坏 3 个）。必须写 `(4 - strLen % 4) % 4`。

**打完补丁后同样 4 个用例：**

```
0/4 cases corrupted        ← 全部通过
```

**⚠️ 但我必须诚实说明验证边界**：我手上**没有 `Grok Bot.app v0.18.0` 的原始 app.asar**（只有解出来的产物），所以无法确认上游那份文件的 `strLen` 究竟是多少。从 `extracted/` 内容正确这个事实可以**反推** `pad == 0` 或 `pad == 1`，但这是推断，不是观测。

### 2.5 复现脚本

完整可运行的最小复现（`/tmp/repro2.mjs`，用法 `node repro2.mjs <extract-asar.js>`）已在 §7 附上。核心是构造 4 个 padding 取值各不相同的 spec-correct asar，检查提取出的字节是否等于 `PAYLOAD!`。

### 2.6 影响分级

| 文件类型 | `pad != 1` 时的后果 |
|---|---|
| PNG / JPG / ICNS | 前若干字节被切（丢魔数），**图片直接损坏** |
| SVG / 文本 | 开头被切 + 尾部多读 padding 垃圾字节 |
| JS | **语法错误，无法解析** |
| 任何文件 | **静默失败，不报错** |

> **这是典型的"单样本正确"bug**：作者只在一份特定文件上验证过，而这份文件的 header 长度刚好落在那唯一的正确分支上。换一个 app.asar（换个 app 版本、装不同扩展）就会静默产出损坏文件。

### 2.7 其他健壮性问题

| 问题 | 证据 | 严重度 |
|---|---|---|
| 非 asar 输入 → 崩溃且无友好提示 | 喂 README.md：`pickleSize: 1109420911 strLen: 2313720487` → `RangeError [ERR_OUT_OF_RANGE]` | 中 |
| 无魔数校验 | 不检查前 4 字节是否为 `4`；不检查 JSON 是否以 `{` 开头 | 中 |
| `strLen` 无上限 | 攻击性输入可致 `Cannot create a string longer than 0x1fffffe8` | 低 |
| `interesting` 正则覆盖不全 | 只匹配 `icon\|logo\|grok\|swirl\|sparkle\|favicon\|mark\b\|brand\|symbol` + 图片扩展名，**不导出 JS/CSS/字体/音频**。对"抽几何数据"这个真实用途来说太窄——`geometry-raw.js`（47KB）显然不是靠这个正则捞出来的 | 低（但说明 README 说的"按需使用"是真的：主力提取是手工做的） |
| 退出码 | 非 asar 输入时进程仍 exit 0，CI 里无法据此判失败 | 低 |
| unpacked 路径 | `path.dirname(asarPath) + ".unpacked"` 用字符串拼接而非 `path.join`，Windows 下判断会错 | 低 |

---

## 2.8 附：最小复现脚本

```js
// repro2.mjs — node repro2.mjs <path/to/extract-asar.js>
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SCRIPT = process.argv[2];
const results = [];

for (const targetLen of [100, 101, 102, 103]) {
  let hdr = null;
  for (let extra = 0; extra < 80; extra++) {
    const name = "icon" + "z".repeat(extra) + ".png";   // 名字要能被 extractor 的过滤器捞到
    const o = { files: { [name]: { size: 8, offset: "0" } } };
    if (JSON.stringify(o).length === targetLen) { hdr = o; break; }
  }
  if (!hdr) continue;

  const j = Buffer.from(JSON.stringify(hdr));
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(j.length);
  let inner = Buffer.concat([lenBuf, j]);
  const pad = (4 - (inner.length % 4)) % 4;             // Chromium Pickle 4 字节对齐
  inner = Buffer.concat([inner, Buffer.alloc(pad)]);

  const pk = Buffer.alloc(8);
  pk.writeUInt32LE(inner.length, 0); pk.writeUInt32LE(4, 4);
  const outer = Buffer.alloc(4); outer.writeUInt32LE(4);

  const asar = `/tmp/rep_${targetLen}.asar`;
  const outdir = `/tmp/rep_out_${targetLen}`;
  rmSync(outdir, { recursive: true, force: true });
  writeFileSync(asar, Buffer.concat([outer, pk, inner, Buffer.from("PAYLOAD!")]));

  const key = Object.keys(hdr.files)[0];
  let got = null, err = null;
  try {
    execFileSync("node", [SCRIPT, asar, outdir], { stdio: "pipe" });
    got = readFileSync(`${outdir}/${key}`, "utf8");
  } catch (e) { err = String(e.message).split("\n")[0].slice(0, 90); }

  results.push({ jsonLen: j.length, pad, expected: "PAYLOAD!", got, ok: got === "PAYLOAD!", err });
}

console.log(JSON.stringify(results, null, 1));
const ran = results.filter(r => r.ok !== undefined);
console.log(`\n${ran.filter(r => !r.ok).length}/${ran.length} cases corrupted`);
```

**运行结果（未修）：`3/4 cases corrupted`　｜　（已修）：`0/4 cases corrupted`**

---

## 3. 复刻引擎的架构（这部分做得很好）

### 3.1 数据层：`GROK_GEO`（79KB，实为格式化后的原数据）

我把它 parse 出来逐字段核过：

```json
{
  "Re": 114.2705, "G9e": 21, "VJt": 5,
  "viewBox": {"minX":-15,"minY":-15,"width":259,"height":259},
  "blobPath": "M228.541 114.228C228.541 130.133…",
  "starPath": "M0.000 -1.000L0.247 -0.340…",
  "starColor": "#f4c34e",
  "palette": {11 色},
  "eyes":    [25 组],
  "shapes":  {18 个身形}
}
```

**交叉核验结果（对 5.8MB bundle 逐符号比对）**：

| 项 | 复刻值 | bundle 原值 | 一致 |
|---|---|---|---|
| `blobPath` | `M228.541 114.228C228.541 130.133…` | 同 | ✅ |
| `eyes[0][0][0]` | `[130.36, 45.98]` | `u3=[[[[130.36,45.98],…` | ✅ |
| palette 11 色 | `{black,brown,red,…,gray}` | `snt={black:{light:"#000000",dark:"#FFFFFF"},…}` | ✅ 逐色全等 |
| shapes 18 个 | `blob…leaf` | `Jo={blob:Po("Blob",…),…}` | ✅ 集合相同 |
| `starColor` | `#f4c34e` | `WJt="#f4c34e"` | ✅ |
| `G9e` / `VJt` | `21` / `5` | `G9e=21,VJt=5` | ✅ |

**一个值得注意的发现**：`starPath` **不是硬编码字符串**，bundle 里是现算的：

```js
GJt=(()=>{const n=[];for(let e=0;e<10;e++){
  const t=-Math.PI/2+e*Math.PI/5, s=e%2===0?1:.42;
  n.push(`${(Math.cos(t)*s).toFixed(3)} ${(Math.sin(t)*s).toFixed(3)}`)
}return "M"+n.join("L")+"Z"})()
```

即**五角星 = 10 个顶点交替半径 1 / 0.42 的正弦余弦**（`2π/10` 步进，从 `-π/2` 起）。复刻版把它固化成了字符串 —— 能用，但丢掉了"它是怎么生成的"这层信息。**这是整个复刻里唯一一处"知其然不知其所以然"的地方。**

### 3.2 结构层：18 个身形是**程序化生成的**，不是画出来的

```js
Jo = { blob: Po("Blob", HJt),
       pebble: Po("Pebble", o_t(108,.075,1.1)),
       bean: Po("Bean", a_t(94,112,.34,Math.PI), {solid:[[-16.8,-102,0,42],…]}), … }
```

每个 shape 的 `face` 字段才是关键（复刻版保留了）：

```json
"bean":     {"x":0, "y":0, "sx":0.72, "sy":0.90, "eye":0.87}
"wedge":    {"x":0, "y":24,"sx":0.70, "sy":0.70, "eye":0.79, "leftDX":-6}
"tablet":   {"x":0, "y":0, "sx":0.94, "sy":0.65, "eye":0.82}
```

**`sx/sy` 是脸部区域的缩放，`eye` 是眼睛整体缩放，`leftDX` 是左右眼非对称偏移。**

我实测了 path 长度分布，能看出**两类身形**：

| 类型 | 例子 | path 长度 | 含义 |
|---|---|---|---|
| **解析式曲线** | blob 572 / tablet 189 / capsule 194 / hex 226 / crystal 232 / teardrop 169 / wedge 121 | 100~600 | 用几段圆弧/贝塞尔拼的几何体 |
| **采样点云** | pebble 4925 / bean 4869 / egg 4912 / gem 4911 / cloud 6139 / leaf 4930 / squircle 4811 | 4800~6200 | 逐点采样的有机形状 |

> **判据：同一份数据里 path 长度出现 121 和 6139 这种 50 倍差距，说明上游不是"画了 18 个形状"，而是"写了两套生成器 + 调参"。** 这也解释了为什么 bundle 里是 `Po("Blob", HJt)` 这种"标签 + 生成函数"的形式。

### 3.3 状态机：39 态，分 4 组（`g_t`）

```
Lifecycle      sleeping waking idle listening thinking searching working          (7)
Reactions      excited surprised suspicious angry drowsy happy curious confused
               bored proud shy sad laughing scared playful celebrate             (16)
Agent morphs   orbit radar progress                                              (3)
Product        spawning humming loading dictating writing sending receiving
lifecycle      uploading notifying alerting dragging bouncing powering-down      (13)
                                                                        合计 39
```

复刻版 `tables.js` 里保留了完整三张表：

```js
EYE_PLAYLIST   // 状态 → 眼睛拓扑索引序列（如 thinking:[8,16,14,17,5]）
EYE_HOLD_MS    // 状态 → [最小,最大] 停留毫秒（如 idle:[9000,16000]）
BLINK_MS       // 状态 → 眨眼间隔范围；null = 不眨眼（sleeping/waking/orbit…）
```

**`EYE_PLAYLIST` 是这套引擎最巧的设计**：每个状态绑定一串**眼睛拓扑索引**，状态持续期间按序切换。

```js
sleeping:[13,22,4]     // 闭眼类拓扑
listening:[10,1,19]    // 侧目 / 半睁
thinking:[8,16,14,17,5] // 5 组快速轮转 = "思考感"
searching:[15,9,3,20,12,18] // 6 组 = "扫视感"
orbit:[0,8]  radar:[0,8]  progress:[0,8]  // 三个 agent morph 眼睛完全一样 → 区别全在 overlay
```

> **判据：`orbit`/`radar`/`progress` 三个"agent 形态"共用同一组眼睛 `[0,8]`，差异 100% 由 overlay 图层承担。** 这是模块化设计——眼睛子系统对"agent 语义"一无所知。

### 3.4 弹簧：`SPRINGS`（15 个通道）

```js
spin:[5,0.9]  x:[3.5,1]  y:[4,1]  squash:[10,0.8]  blink:[26,1]  eyeScale:[9,0.85]
gazeX:[13,1]  gazeY:[13,1]  notify:[9,0.55]  humDots:[6,1]
overlay:[14,1]  overlayMix:[11,1]  shape:[10,1]  overlayTurn:[14,1]  spinTurn:[6.2,1]
```

bundle 里对应的求解器（`spring-raw.js` 唯一一行）：

```js
const tc = n => ({x:n, v:0, t:n}),
xl = (n,e,t,s) => {                        // n=state, e=stiffness, t=target, s=dt
  n.v += (-2*t*e*n.v - e*e*(n.x-n.t)) * s;  // 阻尼弹簧：a = -2ζωv - ω²(x-target)
  n.x += n.v * s;
  (!Number.isFinite(n.x) || !Number.isFinite(n.v)) && (n.x = n.t, n.v = 0);  // 数值爆炸自愈
},
T_t = 1/120,                                // 固定步长 120Hz
S_t = n => Math.max(1, Math.ceil(n / T_t)); // 每个 rAF 帧要跑几个子步
```

**三个值得学的点**：
1. **ζ = 1 的临界阻尼**（`blink` / `shape` / `overlayTurn` 等）—— 无过冲
2. **ζ < 1 的欠阻尼**（`spin` 0.9 / `squash` 0.8 / `eyeScale` 0.85 / `notify` 0.55）—— **有回弹，是"活"的来源**。`notify` 0.55 最软，专门给通知抖动用
3. **固定步长 120Hz + 子步循环**，而不是用可变 dt 直接积分 —— 这是防弹簧在不同刷新率设备上行为不一致的标准做法

复刻版实测值（线上 demo 运行时读出）：

```json
{"spin":[5,0.9],"x":[3.5,1],"y":[4,1],"squash":[10,0.8],"blink":[26,1],
 "eyeScale":[9,0.85],"gazeX":[13,1],"gazeY":[13,1],"notify":[9,0.55],"humDots":[6,1],
 "overlay":[14,1],"overlayMix":[11,1],"shape":[10,1],"overlayTurn":[14,1],
 "spinTurn":[6.2,1],"manualMix":[7,1]}
```

**`manualMix:[7,1]` 是复刻版自己加的**（bundle 里没有）—— 用来混入手动拖动。诚实。

### 3.5 眼睛：25 组拓扑 + 弹簧插值 + 顶点级 lerp

```js
_morphEyes(index, stiffness = 7) {
  if (index === this.eyeTo && this.eyeMorph.t === 1) return;
  const t = clamp(this.eyeMorph.x, 0, 1);
  this.eyeFrom  = this.eyeTo;
  this._fromPolys = this._currentPolys(t);   // ← 打断时从"当前插值中间态"续接
  this.eyeTo = index;
  this.eyeMorph.x = 0; this.eyeMorph.v = 0; this.eyeMorph.t = 1;
  this.eyeStiffness = stiffness;
}
_currentPolys(t) {
  const eyes = g.GROK_GEO.eyes;
  const from = this._fromPolys || eyes[this.eyeFrom];
  const to = eyes[this.eyeTo];
  return [lerpPoly(from[0], to[0], t), lerpPoly(from[1], to[1], t)];
}
```

**每组眼睛 = 2 个多边形 × 48 个顶点**（实测 `lens: [48, 48]`）。切换时**逐顶点线性插值**，插值进度 `eyeMorph.x` 由弹簧驱动。

⚠️ **`_fromPolys` 那一行是这里最精细的设计**：如果一次 morph 还没跑完就触发下一次，它先把**当前插值出来的中间多边形**存下来当作新的起点。没有这行，连续快速切状态会"跳"。

### 3.6 实测：眼睛拓扑是**真的**在换，不是障眼法

线上 demo 探针，把两个 `<path>` 的 `d` 属性读出来：

```json
{"state":"curious", "eyeFrom":13, "eyeTo":3, "uniformEyes":true,
 "eyeCount":2, "dSame":false,
 "t0":"translate(10.04 150.05) matrix(0.0324 0.0081 -0.0133 0.7735 0 0) translate(-57.22 -135.85)",
 "t1":"translate(37.00 143.99) matrix(0.7372 0.0577 -0.0392 0.8035 0 0) translate(-123.39 -120.27)"}
```

`GROK_GEO.eyes[3][0][0] = [44.72, 103.35]`，而 DOM 里 `d` 开头是 `M65.73 117.36` —— 经过 face tune（`size 0.86 / gap 1.18 / eyeWidth 0.96 / eyeHeight 0.92`）+ 非均匀 `matrix` 变换后的结果。**变换矩阵里 `0.0324 / 0.7372` 这种极不对称的值，正是"单只眼睛被单独压扁/旋转"的证据。**

### 3.7 状态扫描（18 态实测，小尺寸 bot）

| state | eyeFrom→eyeTo | bodyLen | overlay |
|---|---|---|---|
| sleeping | 0→3 | 3704 | — |
| waking | 0→3 | 3704 | — |
| idle | 15→0 | 3704 | — |
| listening | … | 3704 | — |
| thinking | … | 3704 | **有** |
| curious | 0→3 | 3704 | — |
| celebrate | 3→2 | **3751**（bean） | — |
| angry | 2→7 | **3754**（hex） | — |
| radar | 7→0 | **3708**（cloud） | **radar** |

**`bodyLen` 随 shape 变（3704/3751/3754/3708）= 每个身形的 path 是真的被替换了**，不是 CSS 变形。

---

## 4. ⚠️ 免责声明与仓库实际内容不符

README 第 2 行：

> Unofficial spring-driven character engine study. **Geometry and third-party assets are not included.**

中文 README 也写"几何数据……均归 xAI / 相应权利人所有"。

**但 `replica/geometry-data.js` 有 79,269 字节，里面是完整的 25 组眼睛顶点、18 个身形 path、11 色 palette。** 我在 §3.1 已逐项确认它和 bundle 完全一致。

作者自己也在 README 的表格里写了：

```
| `replica/geometry-data.js` | `u3` 25 眼、`Jo` 18 身形、`snt` 11 色 |
```

**所以"not included"指的是 `assets/` 里的位图商标，但这句话在英文 description 里被写成通则，读起来像整个仓库都不含几何数据。** 这是描述精度问题，不是恶意——但 fork / 二次分发时值得注意：**几何数据是在仓库里的。**

另外 `extracted/index-UbX-y3il.js` 是 **5.8MB 的完整混淆 bundle**，占全仓 96% 体积。这不是"片段"，是**整个主包**。

---

## 5. 我在沙箱里跑的情况

### 5.1 `extract-asar.js` —— 跑通了，见 §2

### 5.2 线上 demo —— **完全可用**，逐项验证

`https://grok-icon-study.vercel.app/replica/index.html`

运行时探针（`execute_js`）：

```json
{"engines":{"geo":true,"math":true,"fx":true,"tables":true,"eyes":true,"tricks":true},
 "bots":2, "botState":"happy", "botMode":"onboarding", "botShape":"blob",
 "buttons":75,
 "stateBtns":39, "shapeBtns":18, "swatches":11,
 "geo":{"eyes":25,"shapes":18,"palette":11,
        "viewBox":{"minX":-15,"minY":-15,"width":259,"height":259}}}
```

**39 个状态按钮、18 个身形按钮、11 个色板，全部与 `GROK_GEO` 数据量一致。**

### 5.3 ⭐ 实测登录轮换：README 的 `pjn` 公式被验证

README 写：

> 登录页原参数：`sizePx: 64`、`color: "black"`、`shape: "blob"`。
> `pjn(n) = n%2===0 ? idle : cSe[(n-1)/2]`，间隔 `1200ms`。

我开 `#mode-onboard` 后按 16ms 采样大预览的状态变化，11 秒：

```
idle@19 → curious@1622 → idle@2983 → happy@4351 → idle@5709
       → playful@7095 → idle@8472 → excited@9888

间隔(ms): 1358 1361 1368 1377 1386 1416 1603     中位数 1377
```

**序列完全符合 `idle, curious, idle, happy, idle, playful, idle, excited`** —— 即 `cSe = [curious, happy, playful, excited, …]` 按 `pjn` 交替。✅

⚠️ **但间隔实测中位 1377ms，不是 README 说的 1200ms**（+14.8%，且单调递增 1358→1603）。

原因：`ONBOARDING_MS = 1200` 是**逻辑间隔**，实际由 `requestAnimationFrame` 循环检查 `now - this.stateAt >= ONBOARDING_MS` 触发，且状态切换时 `setState()` 内部还有 `_morphEyes()` + `rand()` 调用开销。在无 GPU 的 headless 环境里 rAF 变慢，累积成 +15% 漂移。

> **判据：`1200ms` 是代码常量，`1377ms` 是观测值。读源码得到的时序参数，在低帧率环境下会有系统性偏差——尤其是用 rAF 做定时器的实现。**

### 5.4 `replica/snap.mjs` —— macOS 硬编码，Linux 跑不了

```js
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
```

我改了路径 + 加 `--no-sandbox --disable-dev-shm-usage` 后，遇到**本沙箱 Chromium 的一个环境问题**：

- `Browser.getVersion`（browser 级）**正常返回**
- `Page.enable` / `Runtime.enable`（page 级 session）**永远超时，然后 WS 直接关闭**
- 用 `Target.attachToTarget(flatten:true)` 挂到 page target 上，同样超时

诊断过程（值得记录）：先怀疑 WebSocket 实现 → 写独立 probe，**global WebSocket 收发正常**（`Browser.getVersion` 回来了）；再怀疑 page target 有问题 → 发现 `--disable-extensions` 也拦不住一个 `chrome-extension://nkeimhogjdpnpccoofpliimaahmaaome`（Google Hangouts）的 background_page 被加载；最后确认是 **page 级 renderer 在此容器里起不来**（无 GPU 进程、无 dbus、无 `/proc/bus/pci`）。

**结论：不是 `snap.mjs` 的问题，是这个 PRoot 容器跑不了 Chromium 的 page 级 CDP。** 换真机 / 有 GPU 的容器应该正常。

### 5.5 我实际用了什么

因为 §5.4，视觉验证走了 `browser_use`（app 内置 WebKit）而不是本地 Chromium。上面所有运行时数据都是从**线上 demo** 读的真实值。

---

## 6. 值得学的工程点（汇总）

1. **`_fromPolys` 打断续接**（§3.5）—— 动画可被打断且不跳，靠的是"把当前中间态存成新起点"。这是很多动画库都漏掉的一行。
2. **固定步长 120Hz + 子步**（§3.4）—— 而不是可变 dt 直接积分。
3. **弹簧的 ζ 分布是有语义的**：`notify` 0.55（软，抖）vs `blink` 1.0（硬，利落）。**不是随手填的。
4. **`EYE_PLAYLIST` 把"情绪"降解成"眼睛拓扑序列"** —— 39 个状态不需要 39 套眼睛，只需要 25 组拓扑 + 39 条播放列表。**状态数 >> 素材数是这套设计的核心。**
5. **`face` 字段让身形与脸解耦**（§3.2）—— 18 个形状各自声明脸怎么放，引擎不需要知道"bean 长什么样"。
6. **`extracted/` 与 `replica/` 分层** —— 原料原样保留 + 成品重写，**两层都在仓库里**，别人能自己核对。
7. **`state-tables-raw.js` 单行保留 minified 原样** —— 没有假装"我写的"，注释明确说 `from Grok Bot.app v0.18.0`。

---

## 7. 我认为站不住 / 可以更好的地方

1. **`extract-asar.js` 的 off-by-one（§2）** —— 唯一一个真 bug，而且是静默失败型。
2. **`starPath` 被固化成字符串（§3.1）** —— 丢了生成公式，是复刻里唯一一处"知其然不知其所以然"。
3. **README 英文 description 的 "Geometry … not included"（§4）** —— 与仓库内容不符。
4. **`snap.mjs` 硬编码 macOS Chrome 路径** —— 没有 `process.env.CHROME` 或平台探测。
5. **仓库无 LICENSE** —— 但这不是疏漏，是**结构性的**：作者在 README 里写"素材归 xAI 所有，请勿商用或再分发"，那就**没法给一个开源 license**。这是一个诚实的困境，不是错误。
6. **`extract-asar.js` 的 `interesting` 正则与实际用途不匹配** —— 真正要抽的 `u3`/`Jo`/`snt` 都不在正则覆盖范围内，说明主力提取是手工做的，脚本只是"顺手给的辅助"。README 说"按需使用"是实话。

---

## 8. 一句话给想 fork 的人

**代码可以学，数据不要用。**

`replica/src/` 那 2,000 行（character / pose / eyes / fx / math / tables / tricks）是一份干净的、可复用的**参数化角色动画引擎**——把那 25 组眼睛和 18 个身形换成你自己的形状，整套弹簧 / 状态机 / 拓扑插值逻辑直接能用。

但 `geometry-data.js` 里的顶点、`assets/` 里的图标、`extracted/index-*.js` 里的 5.8MB bundle，都是 xAI 的。README 已经说了不要商用、不要再分发。

---

*分析者：Minis（fork 至 `o1laabs/grok-icon-study`）*
*方法：源码通读 + 自建 spec-correct asar 样本实跑 + 对 5.8MB bundle 逐符号交叉核验 + 线上 demo 运行时探针*
