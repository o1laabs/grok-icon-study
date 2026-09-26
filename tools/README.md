# extract-bundle-symbols.mjs

从 Electron `app.asar` 里把 Grok Bot 角色引擎的**几何 / 配置表**抽成 JSON。

```bash
node extract-bundle-symbols.mjs "Grok Bot.app/Contents/Resources/app.asar" -o out/
```

| 选项 | 作用 |
|---|---|
| `-o <dir>` | 输出目录（默认 `./bundle-symbols`） |
| `--all` | 除已知表外，额外 dump 扫描到的候选符号 |
| `--list` | 只列 asar 内文件，不提取 |

无依赖，Node 18+。

---

## 为什么不直接用仓库里的 `extract-asar.js`

那个脚本的过滤器是**白名单正则**：

```
icon|logo|grok|swirl|sparkle|favicon|mark\b|brand|symbol   +   图片扩展名
```

而 `u3` / `Jo` / `snt` 住在 `index-<hash>.js` 里 —— 文件名不在白名单，扩展名也不在图片列表，**两道门都过不去**。它只能捞到静态商标（README 自己说那是「不是角色引擎」）。

本脚本换成**扫 JS 全文 + 符号名锚定 + 括号配对**，直接切出目标表达式。

---

## 顺带修掉的 asar 解析 bug

原 `extract-asar.js` 用 `dataStart = 16 + strLen + 1`，把 Chromium Pickle 的 **4 字节对齐 padding** 当成了「1 字节 null 终止符」。

正确写法：

```js
const pad = (4 - (strLen % 4)) % 4;     // ⚠️ 不能写 ((-strLen) % 4)：JS 的 % 保留符号
const dataStart = 16 + strLen + pad;
```

| `strLen % 4` | 真实 pad | 原脚本 `+1` 是否正确 |
|---|---|---|
| 0 | 0 | ❌ 早 1 字节 |
| 1 | 3 | ❌ 早 2 字节 |
| 2 | 2 | ❌ 早 1 字节 |
| 3 | 1 | ✅ 巧合正确 |

**四种情况里三种会静默产出错位文件**（不报错）。上游那份 app.asar 恰好落在唯一的正确分支上，所以作者没发现。

实测（构造 4 个 `dataStart` 各不相同的 spec-correct asar，检查抽出的 PNG 是否逐字节相等）：

```
原 extract-asar.js:  pad=0 损坏 | pad=1 完整 | pad=2 损坏 | pad=3 损坏
本脚本:              pad=0 完整 | pad=1 完整 | pad=2 完整 | pad=3 完整
```

---

## 抽取结果

| 输出 | 内容 | 状态 |
|---|---|---|
| `u3.json` | 25 组眼睛多边形，`[eye][polygon][point]` | ✅ 可静态解析 |
| `snt.json` | 11 色板 | ✅ 可静态解析 |
| `Jo.raw.js` | 18 种身形的**源码表达式** | ⚠️ 需运行时求值 |
| `_summary.json` | 每个符号的字节区间、来源 bundle、警告 | — |

### 为什么 `Jo` 只能给源码

`Jo` 的值形如：

```js
Jo = { blob: Po("Blob", o_t(108, .075, 1.1), {...}), ... }
```

`Po` 是运行时函数（做重采样 + 归一化，依赖 `p_t` / `$Be` 等辅助函数）。**最终 path 是算出来的，静态解析拿不到**。上游的 `replica/` 就是为此重写了整条几何管线。

所以本脚本如实标注 `needsRuntime: true` 并把源码表达式落盘，**不假装能算**。

### 验证：抽取结果与上游手工版逐字节相同

拿 `u3.json` / `snt.json` 与上游 `replica/geometry-data.js` 对比：

```
pad=0: u3==ref True   snt==ref True
pad=1: u3==ref True   snt==ref True
pad=2: u3==ref True   snt==ref True
pad=3: u3==ref True   snt==ref True
```

---

## `--all` 扫到的额外表

用结构特征（不靠变量名，压缩后名字会变）扫出的候选，**上游 replica 里没有**：

| 候选 | 内容 |
|---|---|
| `g_t` | **状态分类总表**：4 类 39 个状态（Lifecycle / Reactions / …） |
| `Rs` / 时长表 | 各状态持续时间（毫秒），含 `null` 表示不限时 |
| 状态序列 | 按类别分组的状态播放序列 |

`g_t` 尤其有用 —— 它比 `replica/` 里覆盖的状态集更全，能直接拿来扩充复刻实现。

（已知误报：KaTeX 字体度量表会命中「时长表」模式，已按 key 名过滤。）

---

## 边界

- **需要原始 `app.asar`**。仓库里只有解出来的产物，没有原包；得自己从 macOS 上取
  `Grok Bot.app/Contents/Resources/app.asar`。
- 变量名（`u3` / `Jo` / `snt` / `g_t` …）是压缩产物，**换版本大概率会变**。已知符号靠锚点正则匹配，命中多处时**取最长表达式**，同长时优先真实 bundle 而非 `-raw` 片段文件。
- 只处理 `app.asar` 本体；`.unpacked/` 目录（原生模块等）不参与扫描。
