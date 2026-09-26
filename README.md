# Grok Bot 角色复刻（仅供学习参考）

> 素材归 xAI / 相应权利人所有。  
> 本仓库仅供学习参考，请勿商用或再分发。

这是对 **Grok Bot.app v0.18.0** 登录页角色动效的学习复刻，用于研究状态机、弹簧动画、多边形眼睛等实现。

## 打开

浏览器打开 [`replica/index.html`](./replica/index.html)。

登录页原参数：`sizePx: 64`、`color: "black"`、`shape: "blob"`。  
`pjn(n) = n%2===0 ? idle : cSe[(n-1)/2]`，间隔 `1200ms`。  
playground 有意从 curious 起播；点「登录轮换」才按 `pjn(0)=idle` 重来。大预览默认开指针跟随，源码默认关。

## 项目结构

| 路径 | 内容 |
|---|---|
| `replica/index.html` | L1 舞台 |
| `replica/src/` | 拆开的引擎：character / pose / tricks / eyes / fx / math / tables |
| `replica/geometry-data.js` | `u3` 25 眼、`Jo` 18 身形、`snt` 11 色 |
| `replica/grok-blob-idle.svg` | 静态 blob + idle `u3[0]` |
| `extracted/` | 从主包抽出的学习参考片段 |
| `extract-asar.js` | 解包辅助脚本（按需使用） |
| `assets/icon.iconset/`、`assets/app-icon-256.png` | Dock / 应用内静态商标（不是角色引擎） |

---

## ⚠️ fork 方附加：独立代码分析

> 以下内容由 fork 方（[o1laabs](https://github.com/o1laabs)）独立撰写，**不代表上游作者观点**。
> 完整报告见 **[`ANALYSIS.md`](./ANALYSIS.md)**。

### 发现的 bug：`extract-asar.js` 存在对齐 off-by-one，**3/4 的情况静默产出损坏文件**

`extract-asar.js` 里这一行：

```js
const dataStart = 16 + strLen + 1;
```

那个 `+1` 是错的对齐补偿 —— 作者把 Chromium Pickle 的 **4 字节对齐 padding** 当成了「1 字节 null 终止符」。实际 padding 长度是 `(4 - strLen % 4) % 4`，取值为 `0/1/2/3`。

**最小复现**（[`tools/repro-asar-offbyone.mjs`](./tools/repro-asar-offbyone.mjs)）：

```bash
node tools/repro-asar-offbyone.mjs extract-asar.js
# → 3/4 cases corrupted
```

| `strLen` | 真实 pad | 脚本算出 `dataStart` | 正确值 | 提取结果 | |
|---|---|---|---|---|---|
| 100 | 0 | 117 | 116 | `"AYLOAD!\0"` | ❌ |
| 101 | 3 | 118 | 120 | `"\0\0PAYLOA"` | ❌ |
| 102 | 2 | 119 | 120 | `"\0PAYLOAD"` | ❌ |
| 103 | 1 | **120** | 120 | `"PAYLOAD!"` | ✅ |

**当 `strLen % 4 == 3` 时 `pad == 1`，那个 `+1` 恰好命中** —— 这正是它在作者手上能跑通的原因。上游那份 app.asar 的 header JSON 长度很可能正好落在这唯一正确的分支上。

**修法（1 行）**：

```js
- const dataStart = 16 + strLen + 1;
+ const dataStart = 16 + strLen + ((4 - (strLen % 4)) % 4);
```

⚠️ **别写成 `((-strLen) % 4)`** —— JS 的 `%` 保留符号，`(-101) % 4 === -1`，不是 `3`。

**验证边界（诚实说明）**：fork 方手上**没有** `Grok Bot.app v0.18.0` 的原始 `app.asar`，因此无法观测上游那份文件的 `strLen` 究竟是多少；「`pad == 0` 或 `1`」是从 `extracted/` 内容正确这一事实**反推**的，不是观测结果。

### 其余结论摘要（详见 `ANALYSIS.md`）

- **引擎质量很高**：7 个模块 41KB 手写 JS，无依赖无构建。弹簧用「解析解 + 每帧精确推进 dt」而非固定步长累加，所以**帧率无关**；`SPRINGS` 表里专门给 `spin` 配了 `eps: 0.006` 保证旋转能真正停稳。
- **眼睛系统是干净的 morph 架构**：不是每状态一张图，而是 25 组多边形之间插值；`UNIFORM_EYES` 标志表明两个眼睛**共用同一份多边形数据**（左右靠镜像 transform 区分），所以库里只需存 25 份而非 50 份。
- **对 bundle 交叉核验**：`snt` 11 色**逐键完全一致**；`Jo` 18 身形**集合完全一致**；`u3` 25 眼可解析。**数据层是忠实的。**
- **登录轮换实测**：线上 demo 实测 `idle → curious → idle → happy → idle → playful → idle → excited`，间隔中位数 **1377ms**（含 16ms 采样栅格），与 `1200ms` 标称值在合理范围内吻合 —— **README 这句描述是真的，可验证。**
- **`extract-asar.js` 只是辅助脚本**：它的 `interesting` 正则只覆盖 `icon|logo|grok|swirl|sparkle|favicon|mark|brand|symbol` + 图片扩展名，**完全捞不到**真正要抽的 `u3`/`Jo`/`snt`（那些在 JS 里）。README 说"按需使用"是实话 —— 主力提取是手工做的。

### 免责声明

- 本仓库仅用于学习参考。
- 所有角色造型、商标、图标、几何数据及从应用包中提取的内容，均归 xAI / 相应权利人所有。
- 请勿用于商业用途，请勿再分发。
- 请勿将本仓库内容当作自己的商标或原创素材发布。
