# grok-icon-study

Unofficial study of a spring-driven character engine.  
非官方学习项目，与 xAI / Grok 无关。本仓库只开源机芯，不含角色几何、商标或第三方应用源码。

登录页那种会眨眼、换情绪、被弹簧拉着走的角色，不是 GIF / Lottie，而是状态机 + 弹簧 + 多边形眼睛。这里把机芯拆开，方便阅读和改。

## 打开

用浏览器打开 [`replica/index.html`](./replica/index.html)。

克隆下来默认**看不到完整角色外形**。没有 `replica/geometry-data.js` 时，页面会停在说明态，不会报错崩掉。

自备几何的接口见 [`replica/geometry.schema.md`](./replica/geometry.schema.md)。把符合接口的文件放到 `replica/geometry-data.js` 即可本地预览。该路径已被 git 忽略。

不要把从商业应用抽出的几何、图标或主包提交到本仓库，也不要再分发。

## 机芯在做什么

- 39 个情绪 / 生命周期状态，每态有眼睛 playlist、眨眼间隔、注视节奏
- 弹簧驱动位移、挤压、旋转、眨眼、换形
- 眼睛是多边形 morph，不是贴图
- 部分状态会切 overlay（thinking / orbit / writing / loading 等）
- 登录包装带 `pose.scale`、指针跟随、onboarding 轮换

登录页常见参数：`sizePx: 64`，`color: "black"`，`shape: "blob"`。  
`pjn(n) = n % 2 === 0 ? idle : onboarding[(n-1)/2]`，间隔 1200ms。  
playground 有几何时从 `curious` 起播；点「登录轮换」才按 `pjn(0)=idle` 重来。

## 目录

| 路径 | 内容 |
|---|---|
| `replica/index.html` | playground。无几何时显示说明 |
| `replica/geometry.schema.md` | `window.GROK_GEO` 接口，不含数据 |
| `replica/src/math.js` | 弹簧、插值、多边形 |
| `replica/src/tables.js` | 状态表、playlist、弹簧参数 |
| `replica/src/pose.js` | 姿态 / 注视 |
| `replica/src/tricks.js` | 转圈、跳跃等特技 |
| `replica/src/fx.js` | overlay 与粒子 |
| `replica/src/eyes.js` | 眨眼、wink、眼睛绘制 |
| `replica/src/character.js` | `GrokCharacter` 编排 |
| `replica/snap.mjs` | 可选的 headless 快照脚本 |

本仓库故意不含：

- 角色几何（`geometry-data.js`）
- 官方图标 / iconset
- 从应用包抽出的主包或切片
- 解包脚本

## 许可

[MIT](./LICENSE) 只覆盖本仓库里的原创机芯、页面和文档。  
它不授权任何第三方角色造型、商标或应用源码；那些东西也不在这个仓库里。
