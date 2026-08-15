# `window.GROK_GEO` 接口

Playground 只在检测到可用的 `window.GROK_GEO` 时才会创建角色。  
本仓库不附带这份数据。若要本地看完整外形，自行把 `replica/geometry-data.js` 放到同目录，并保证它在 `src/*.js` 之前执行。

不要把从商业应用抽出的几何、图标或主包提交到本仓库，也不要再分发。

## 最小可用对象

```js
window.GROK_GEO = {
  Re: 100,             // 身体逻辑半径，绘制原点
  G9e: 20,             // 眼睛纵向基准
  VJt: 4,              // 非 uniform 眼距预留
  viewBox: { minX: 0, minY: 0, width: 200, height: 200 },
  palette: {
    black: { light: "#111111", dark: "#f4f4f4" },
  },
  eyes: [
    // 下标对应 tables.js 的 playlist。每组 [左眼多边形, 右眼多边形]
    // 每个多边形是 [[x, y], ...]
  ],
  shapes: {
    blob: {
      label: "Blob",
      path: "M ... Z",   // 你自己的 SVG path d
      face: { x: 0, y: 0, sx: 1, sy: 1, eye: 1 },
      radius: 100,
      tiltScale: 1,
      top: 0,
      bottom: 200,
    },
  },
};
```

## 字段

| 字段 | 用途 |
|---|---|
| `Re` | 身体中心 / 变换原点 |
| `G9e` `VJt` | 眼睛缩放与间距 |
| `viewBox` | 舞台视口；机芯里的 `VIEW` 与此对齐 |
| `palette[id].light/dark` | `setColor` 在非 login 墨水下的纯色 |
| `eyes[i]` | 第 `i` 号眼形。`tables.js` 的 playlist 用下标引用，默认按 25 组编排 |
| `shapes[id].path` | 身形轮廓 |
| `shapes[id].face` | 面部相对身体的偏移与缩放，可选 `leftDX` |
| `shapes[id].radius/top/bottom/tiltScale` | 眼睛夹持、点头倾斜 |
| `solids` | 可选。`bean` / `tablet` / `cloud` 等旋转时的截面带 |

默认 playground 从 `shapes.blob` 起播。`tables.js` 的 `SHAPE_ZOOM` 给部分 id 配了缩放；其它 id 仍可渲染。  
`tables.js` 里的 `VIEW` 决定取景框。身形 path 的坐标系最好和它对齐，否则角色会偏出画面。

## 加载

`index.html` 会尝试加载 `geometry-data.js`。文件不存在时页面保持说明态，不会创建 `GrokCharacter`。该文件已被 `.gitignore` 忽略。
