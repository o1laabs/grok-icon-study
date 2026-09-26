#!/usr/bin/env node
/**
 * extract-bundle-symbols.mjs
 *
 * 吃一个 Electron app.asar，自动把 Grok Bot 角色引擎的几何/配置表抽成 JSON。
 *
 *   node extract-bundle-symbols.mjs "Grok Bot.app/Contents/Resources/app.asar" -o out/
 *
 * 为什么不用 extract-asar.js：
 *   那个脚本的白名单正则只匹配 icon|logo|... + 图片扩展名，
 *   而 u3 / Jo / snt 住在 index-*.js 里，两道门都过不去。
 *   本脚本直接扫 JS 全文，按「符号名 + 括号配对」切段。
 *
 * 无依赖，Node 18+。
 */

import { open, writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// ─────────────────────────── 已知目标符号 ───────────────────────────

/**
 * 已知符号表。`shape` 决定用什么切段策略：
 *   "brackets" —— 从起始符开始做括号配对（数组/对象/函数体通用）
 *   "stmt"     —— 取到下一个 `;` 或行尾（简单赋值）
 *
 * `verify` 可选：拿到解析结果后跑一遍断言，不通过就标 ⚠️。
 */
const TARGETS = [
  {
    name: "u3",
    kind: "eyes",
    desc: "25 组眼睛多边形（[eye][polygon][point] 三层数组）",
    shape: "brackets",
    // ⚠️ 锚点要精确到「赋值号右边第一个括号」。
    // 用 u3=[[[ 会把锚点落在第三层上（因为第一个 eye 也以 [ 开头），
    // 切出来的是单个 eye 而不是整个表。用锚点正则 + anchor 偏移解决。
    anchor: /\bu3\s*=\s*\[/,
    anchorOffset: 3, // 匹配串 "u3=[" 里 "[" 的下标
    verify: (v) => Array.isArray(v) && v.length >= 20 && Array.isArray(v[0]) && Array.isArray(v[0][0]),
  },
  {
    name: "Jo",
    kind: "shapes",
    desc: "18 种身形（对象，值是 Po(...) 生成的 path）",
    shape: "brackets",
    anchor: /\bJo\s*=\s*\{/,
    anchorOffset: 3, // "Jo={" 里 "{" 的下标
    verify: (v) => v && typeof v === "object" && Object.keys(v).length >= 10,
  },
  {
    // ── 真实 app.asar (Grok Bot v0.18.x) 里的名字 ──
    // 眼睛表：`const Wt=[[[[130.36,45.98],...`
    name: "Wt",
    kind: "eyes",
    desc: "眼睛多边形表（真实 app.asar 里的名字，等价于 u3）",
    shape: "brackets",
    anchor: /\bWt\s*=\s*\[\[/,
    anchorOffset: 3,
    verify: (v) => Array.isArray(v) && v.length >= 20 && Array.isArray(v[0]) && Array.isArray(v[0][0]),
  },
  {
    // 色板：`cs=[{id:"black",label:"Black",value:"#000"},...]`
    name: "cs",
    kind: "palette",
    desc: "色板（真实 app.asar 里的名字，等价于 snt；含 id/label/value）",
    shape: "brackets",
    anchor: /\bcs\s*=\s*\[\{/,
    anchorOffset: 3,
    verify: (v) => Array.isArray(v) && v.length >= 5 && v.every((x) => x && x.id && x.value),
  },
  {
    // 渐变色板：`I3={black:{lightFrom,lightTo,darkFrom,darkTo},...}`（11 色 × 4 停靠点）
    name: "I3",
    kind: "palette-gradients",
    desc: "渐变色板（真实 app.asar；每个色有 light/dark 两套渐变起止）",
    shape: "brackets",
    anchor: /\bI3\s*=\s*\{/,
    anchorOffset: 3, // "I3={" 里 "{" 的下标
    verify: (v) => v && typeof v === "object" && Object.keys(v).length >= 8,
  },
  {
    // 完整身形名表（18 个，含 wedge/cloud 等）
    name: "q1",
    kind: "shape-names",
    desc: "身形名列表（18 个）",
    shape: "brackets",
    anchor: /\bq1\s*=\s*\["/,
    anchorOffset: 3,
    verify: (v) => Array.isArray(v) && v.length >= 10,
  },
  {
    // 另一组身形名（8 个，按是否支持某特性分组）
    name: "bu",
    kind: "shape-names",
    desc: "身形名列表（8 个，子集）",
    shape: "brackets",
    anchor: /\bbu\s*=\s*\["/,
    anchorOffset: 3,
    verify: (v) => Array.isArray(v) && v.length >= 5,
  },
  {
    name: "snt",
    kind: "palette",
    desc: "11 色板（对象，key → 颜色值）",
    shape: "brackets",
    anchor: /\bsnt\s*=\s*\{/,
    anchorOffset: 4, // "snt={" 里 "{" 的下标
    verify: (v) => v && typeof v === "object" && Object.keys(v).length >= 5,
  },
];

// ── 结构定位器 ────────────────────────────────────────────────
// 压缩产物的变量名每版都变（上游 u3/Jo/snt → 真实包 Wt/cs/I3），
// 但「数据结构」跨版本稳定。这些定位器不靠名字，靠形状 + 值域找目标。
// 名字只在最后作为「输出文件名」用，不作为匹配依据。
// ── SVG path 常量扫描 ─────────────────────────────────────────
// 真实 app.asar 里，身形轮廓是烘焙好的 SVG path 字符串（不是运行时算的）。
// 但同一个 bundle 里也混着大量 UI 图标（Google/Slack 等品牌 logo），
// 靠长度或前缀都区分不开。判据：品牌 logo 的 path 里含品牌色（#4285F4 / #E01E5A 等），
// 且体积大（1KB+ 的复杂图标）；bot 身形轮廓是纯数字路径、无 fill 属性。
const SVG_PATH_SCAN = {
  name: "svg-paths",
  hint: "烘焙的 SVG path 常量（含 UI 图标，需人工区分）",
  // 匹配 name="M<数字>…" 且长度 > 200 的字符串
  re: /([A-Za-z_$][\w$]*)\s*=\s*"(M[-\d.][^"]{200,})"/g,
};

// ── 几何引擎函数扫描 ──────────────────────────────────────────
// 真实包里紧跟在身形 path 后面的是几何处理函数（实测发现 PCA 主成分分析）。
// 这些是「这个角色怎么被算出来」的核心，比数据本身更有参考价值。
const GEOMETRY_FN_SIGNS = [
  { name: "pca", re: /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{[^}]{0,400}(?:covarianc|eigen|powerIterat|principal)/i },
  { name: "resample", re: /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{[^}]{0,300}(?:arcLength|resample|equalSpace|interpolat)/i },
  { name: "normalize", re: /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{[^}]{0,300}(?:centroid|normalize|boundingBox|scaleTo)/i },
];

// 扫出 bundle 里所有「烘焙好的 SVG path 字符串常量」。
// 返回 [{name, path, at, len, brandColors}]，brandColors 用来标记疑似 UI 图标。
function findSvgPathConstants(src) {
  const out = [];
  const re = new RegExp(SVG_PATH_SCAN.re.source, "g");
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const p = m[2];
    // 品牌色检测：path 前后 200 字符内出现品牌色 hex → 大概率是 UI 图标
    const around = src.slice(Math.max(0, m.index - 200), m.index + m[0].length + 200);
    const BRAND = [
      ["#4285F4", "Google-blue"], ["#EA4335", "Google-red"],
      ["#FBBC05", "Google-yellow"], ["#34A853", "Google-green"],
      ["#E01E5A", "Slack-red"], ["#36C5F0", "Slack-blue"],
      ["#2EB67D", "Slack-green"], ["#ECB22E", "Slack-yellow"],
      ["#0A66C2", "LinkedIn"], ["#1877F2", "Facebook"],
      ["#5865F2", "Discord"], ["#FF4500", "Reddit"],
      ["#1DB954", "Spotify"], ["#635BFF", "Stripe"],
    ];
    const brandColors = [];
    for (const [hex, label] of BRAND) {
      if (around.toUpperCase().includes(hex.toUpperCase())) brandColors.push(label);
    }

    // ── 角色几何 vs UI 图标：靠「路径坐标量级」区分 ──
    // 实测：UI 图标（FontAwesome / Lucide 那类）坐标都在 0~24 的小视口里，
    // 角色轮廓在 228×234 的画布上（M228.541 114.228 …）。
    // ⚠️ 不能对整串取 max：路径里还混着 arc 的半径/旋转角、相对位移的小数，
    // 会捞到无关的大数（实测把 20×20 的分享图标算成 ≤998）。
    // 只取 M/L/C/S/Q/T 这些「定位命令」后面紧跟的坐标对。
    let maxAbs = 0;
    const cmdRe = /[MLCSQT]\s*(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g;
    let cm;
    while ((cm = cmdRe.exec(p)) !== null) {
      for (const g of [cm[1], cm[2]]) {
        const v = Math.abs(parseFloat(g));
        if (v > maxAbs) maxAbs = v;
      }
    }
    const looksLikeIcon = maxAbs <= 64;

    out.push({ name, path: p, at: m.index, len: p.length, brandColors, maxAbs, looksLikeIcon });
  }
  // 长的排前面（复杂图标 / 角色轮廓都比简单图标大）
  out.sort((a, b) => b.len - a.len);
  return out;
}



const STRUCT_LOCATORS = [
  {
    // 眼睛表：最外层数组 → 元素是多边形数组 → 多边形是 [float,float] 点
    // 特征：20~60 个元素；元素是 ≥2 个数组；首点 x 在 0~400
    name: "eyes-by-structure",
    kind: "eyes",
    desc: "眼睛多边形表（结构定位，不依赖变量名）",
    find(src, matchBrackets) {
      const re = /([A-Za-z_$][\w$]*)\s*=\s*(\[\[\[\[-?\d)/g;
      let m;
      let best = null;
      while ((m = re.exec(src)) !== null) {
        // ⚠️ 不能写 m.index + m[0].length - 1：那指向匹配串最后一个字符
        // （正则末尾的 \d 或 .），不是开括号。必须显式找第一个 '['。
        const open = m.index + m[0].indexOf("[");
        const span = matchBrackets(src, open, []);
        if (!span) continue;
        const len = span[1] - span[0];
        if (len < 5000 || len > 200000) continue;
        const r = literalToJson(src.slice(span[0], span[1]), []);
        if (!r.ok) continue;
        const v = r.value;
        if (!Array.isArray(v) || v.length < 20 || v.length > 60) continue;
        if (!Array.isArray(v[0]) || !Array.isArray(v[0][0])) continue;
        const p0 = v[0][0][0];
        if (!Array.isArray(p0) || typeof p0[0] !== "number") continue;
        if (p0[0] < 0 || p0[0] > 400 || p0[1] < 0 || p0[1] > 400) continue;
        if (!best || len > best.len) best = { name: m[1], span, value: v, len };
      }
      return best;
    },
    verify: (v) => Array.isArray(v) && v.length >= 20 && Array.isArray(v[0]) && Array.isArray(v[0][0]),
  },
  {
    // 渐变色板：对象 → 值是多色标对象（含 2+ 个 #hex 字段）
    name: "palette-gradients-by-structure",
    kind: "palette-gradients",
    desc: "渐变色板（结构定位：值含 2+ 个 #hex 字段）",
    find(src, matchBrackets) {
      const re = /([A-Za-z_$][\w$]*)\s*=\s*\{\s*[a-z][\w$]*\s*:\s*\{[^}]*#[0-9A-Fa-f]{3,8}/g;
      let m;
      let best = null;
      while ((m = re.exec(src)) !== null) {
        const open = m.index + m[0].indexOf("{");
        const span = matchBrackets(src, open, []);
        if (!span) continue;
        const r = literalToJson(src.slice(span[0], span[1]), []);
        if (!r.ok) continue;
        const v = r.value;
        if (!v || typeof v !== "object" || Array.isArray(v)) continue;
        const keys = Object.keys(v);
        if (keys.length < 8 || keys.length > 20) continue;
        // 每个值必须是对象，且含 ≥2 个 #hex 字符串
        const allGrad = keys.every((k) => {
          const o = v[k];
          if (!o || typeof o !== "object") return false;
          const hexes = Object.values(o).filter((x) => typeof x === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(x));
          return hexes.length >= 2;
        });
        if (!allGrad) continue;
        const len = span[1] - span[0];
        if (!best || len > best.len) best = { name: m[1], span, value: v, len };
      }
      return best;
    },
    verify: (v) => v && typeof v === "object" && Object.keys(v).length >= 8,
  },
  {
    // 单色色板：数组 → 元素是 {id,label,value:#hex}
    name: "palette-flat-by-structure",
    kind: "palette-flat",
    desc: "单色色板（结构定位：[{id,label,value}]）",
    find(src, matchBrackets) {
      const re = /([A-Za-z_$][\w$]*)\s*=\s*(\[\{\s*id\s*:\s*")/g;
      let m;
      let best = null;
      while ((m = re.exec(src)) !== null) {
        const open = m.index + m[0].length - 1;
        const span = matchBrackets(src, open, []);
        if (!span) continue;
        const r = literalToJson(src.slice(span[0], span[1]), []);
        if (!r.ok) continue;
        const v = r.value;
        if (!Array.isArray(v) || v.length < 5 || v.length > 30) continue;
        if (!v.every((x) => x && typeof x === "object" && "id" in x && "value" in x)) continue;
        const len = span[1] - span[0];
        if (!best || len > best.len) best = { name: m[1], span, value: v, len };
      }
      return best;
    },
    verify: (v) => Array.isArray(v) && v.length >= 5 && v.every((x) => x && x.id && x.value),
  },
  {
    // 状态分类总表：数组 → 元素是 {label,states[]}
    name: "state-taxonomy-by-structure",
    kind: "state-taxonomy",
    desc: "状态分类总表（结构定位：[{label,states}]）",
    find(src, matchBrackets) {
      const re = /([A-Za-z_$][\w$]*)\s*=\s*(\[\{\s*label\s*:\s*")/g;
      let m;
      let best = null;
      while ((m = re.exec(src)) !== null) {
        const open = m.index + m[0].length - 1;
        const span = matchBrackets(src, open, []);
        if (!span) continue;
        const r = literalToJson(src.slice(span[0], span[1]), []);
        if (!r.ok) continue;
        const v = r.value;
        if (!Array.isArray(v) || v.length < 3 || v.length > 12) continue;
        if (!v.every((x) => x && x.label && Array.isArray(x.states))) continue;
        const len = span[1] - span[0];
        if (!best || len > best.len) best = { name: m[1], span, value: v, len };
      }
      return best;
    },
    verify: (v) => Array.isArray(v) && v.length >= 3 && v.every((x) => x.label && Array.isArray(x.states)),
  },
];

// 顺手扫的候选表（名字不固定，靠启发式找）
// 这些是 v0.18.0 bundle 里真实存在、且静态可解析的表。
// 名字（g_t / g1e / Qtt …）是压缩产物，换版本会变，所以用「结构特征」而不是名字来定位。
const SCAN_PATTERNS = [
  {
    name: "state-taxonomy",
    hint: "状态分类（label + states 数组）",
    // [{label:"Lifecycle",states:[...]},{label:"Reactions",states:[...]}]
    re: /\[\{label:"[^"]+",states:\[[^\]]*\]\}(?:,\{label:"[^"]+",states:\[[^\]]*\]\})+\]/g,
    verify: (v) => Array.isArray(v) && v.length >= 3 && v.every((x) => x.label && Array.isArray(x.states)),
  },
  {
    name: "index-map",
    hint: "键 → 数字下标数组（结构匹配，语义需人工确认）",
    // {sleeping:[13,22,4],waking:[13],idle:[0,8],...}
    re: /\{[a-z][\w-]*:\[[\d,\s]*\](?:,[a-z][\w-]*:\[[\d,\s]*\]){5,}\}/g,
    verify: (v) => v && typeof v === "object" && Object.keys(v).length >= 6,
  },
  {
    // 状态分类总表：4 类 39 个状态。这是 replica 里没有的关键数据。
    name: "state-taxonomy",
    hint: "状态分类总表（label + states）",
    re: /\[\{label:"[^"]+",states:\[[^\]]*\]\}(?:,\{label:"[^"]+",states:\[[^\]]*\]\})+\]/g,
    verify: (v) => Array.isArray(v) && v.length >= 3 && v.every((x) => x.label && Array.isArray(x.states)),
  },
  {
    name: "state-timings",
    hint: "键 → 整数/毫秒值（结构匹配，语义需人工确认）",
    // {progress:2500,spawning:2e3,...}
    re: /\{[a-z][\w-]*:(?:\d+e?\d*|null)(?:,[a-z][\w-]*:(?:\d+e?\d*|null)){4,}\}/g,
    verify: (v) => v && typeof v === "object" && Object.keys(v).length >= 5,
  },
  {
    name: "state-sequences",
    hint: "键 → 字符串数组（结构匹配，语义需人工确认）",
    re: /\{[a-z][\w-]*:\[[^\]]*\](?:,[a-z][\w-]*:\[[^\]]*\]){2,}\}/g,
    verify: (v) => v && typeof v === "object" && Object.keys(v).length >= 3,
  },
  {
    name: "duration-ranges",
    hint: "状态持续时间区间 [min,max]",
    re: /\{[a-z][\w-]*(?:-[a-z]+)?:\[[\d.]+,\d+\](?:,[a-z][\w-]*(?:-[a-z]+)?:(?:\[[\d.]+,\d+\]|null)){4,}\}/g,
    verify: (v) => v && typeof v === "object" && Object.keys(v).length >= 4,
  },
];

// ─────────────────────────── asar 读取 ───────────────────────────

/**
 * 解析 asar 头。返回 { dataStart, files: [{path,size,offset}] }
 *
 * ⚠️ 关键：Chromium Pickle 会把字符串补到 4 字节对齐，
 *    那个 0x00 是 padding 不是 null 终止符。
 *    dataStart = 16 + strLen + ((4 - strLen % 4) % 4)
 *    （extract-asar.js 写的是 16 + strLen + 1，3/4 的情况会错位）
 */
async function readAsarHeader(asarPath) {
  const fh = await open(asarPath, "r");
  try {
    const pre = Buffer.alloc(16);
    await fh.read(pre, 0, 16, 0);

    const magic = pre.readUInt32LE(0);
    const payloadSize = pre.readUInt32LE(4);
    const headerSize = pre.readUInt32LE(8);
    const strLen = pre.readUInt32LE(12);

    if (magic !== 4) {
      throw new Error(
        `不是 asar 文件（前 4 字节应为 4，实际 ${magic}）。` +
          `确认路径指向 app.asar，而不是普通文件。`
      );
    }
    if (strLen <= 0 || strLen > 64 * 1024 * 1024) {
      throw new Error(`header 长度异常：strLen=${strLen}。文件可能损坏。`);
    }

    const jsonBuf = Buffer.alloc(strLen);
    await fh.read(jsonBuf, 0, strLen, 16);
    let header;
    try {
      header = JSON.parse(jsonBuf.toString("utf8"));
    } catch (e) {
      throw new Error(`header JSON 解析失败（strLen=${strLen}）：${e.message}`);
    }

    const pad = (4 - (strLen % 4)) % 4;
    const dataStart = 16 + strLen + pad;

    const out = [];
    const walk = (node, prefix) => {
      if (!node || typeof node !== "object") return;
      if (node.files) {
        for (const [k, v] of Object.entries(node.files)) walk(v, prefix ? `${prefix}/${k}` : k);
      } else if (node.offset !== undefined) {
        out.push({ path: prefix, size: Number(node.size) || 0, offset: Number(node.offset) || 0 });
      }
    };
    walk(header, "");

    return { dataStart, strLen, pad, payloadSize, headerSize, files: out, fh };
  } catch (e) {
    await fh.close();
    throw e;
  }
}

// ─────────────────────────── 括号配对切段 ───────────────────────────

/**
 * 从 `src[idx]` 开始做括号配对，返回 [start, endExclusive]。
 * 正确处理：字符串（' " `）、模板串插值 ${}、行注释、块注释、正则字面量的简单情形。
 *
 * ⚠️ 正则字面量 vs 除法 的区分在 JS 里是出了名的难（要靠前一个 token）。
 *    这里用「前一个非空白字符」启发式判断：如果是 ( , = : [ ! & | ? { } ; return 之类，
 *    那就当正则。对 bundle 这种机器生成的代码够用，遇到歧义会记录下来而不是静默出错。
 */
function matchBrackets(src, idx, warnings) {
  const open0 = src[idx];
  const PAIRS = { "[": "]", "{": "}", "(": ")" };
  const close0 = PAIRS[open0];
  if (!close0) return null;

  let depth = 0;
  let i = idx;
  let mode = "code"; // code | sq | dq | tpl | line | block | regex
  let tplDepth = 0; // 模板串里 ${ 的嵌套层数
  let regexCls = false; // 正则字符类 [...] 内

  const prevSignificant = (pos) => {
    for (let k = pos - 1; k >= 0; k--) {
      const c = src[k];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") continue;
      return c;
    }
    return "";
  };

  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];

    if (mode === "code") {
      if (c === "'") mode = "sq";
      else if (c === '"') mode = "dq";
      else if (c === "`") {
        mode = "tpl";
        tplDepth = 0;
      } else if (c === "/" && c2 === "/") {
        mode = "line";
        i++;
      } else if (c === "/" && c2 === "*") {
        mode = "block";
        i++;
      } else if (c === "/") {
        const p = prevSignificant(i);
        if (p === "" || "(,=:[!&|?{};+-*%~^<>".includes(p)) {
          mode = "regex";
          regexCls = false;
        }
      } else if (c === open0) {
        depth++;
      } else if (c === close0) {
        depth--;
        if (depth === 0) return [idx, i + 1];
      }
    } else if (mode === "sq") {
      if (c === "\\") i++;
      else if (c === "'") mode = "code";
    } else if (mode === "dq") {
      if (c === "\\") i++;
      else if (c === '"') mode = "code";
    } else if (mode === "tpl") {
      if (c === "\\") i++;
      else if (c === "$" && c2 === "{") {
        tplDepth++;
        i++;
      } else if (c === "}" && tplDepth > 0) {
        tplDepth--;
      } else if (c === "`" && tplDepth === 0) mode = "code";
    } else if (mode === "line") {
      if (c === "\n") mode = "code";
    } else if (mode === "block") {
      if (c === "*" && c2 === "/") {
        mode = "code";
        i++;
      }
    } else if (mode === "regex") {
      if (c === "\\") i++;
      else if (c === "[") regexCls = true;
      else if (c === "]") regexCls = false;
      else if (c === "/" && !regexCls) mode = "code";
      else if (c === "\n") {
        // 正则不可能跨行 —— 说明我们猜错了，回退当除法
        if (warnings) warnings.push(`正则启发式在 offset ${i} 处回退`);
        mode = "code";
      }
    }
    i++;
  }
  return null;
}

// ─────────────────────────── 表达式 → JSON ───────────────────────────

/**
 * 把 JS 字面量表达式转成可解析的 JSON。
 * 处理：
 *   - 无引号 key        {a:1}      → {"a":1}
 *   - 单引号字符串      'x'        → "x"
 *   - 尾随逗号          [1,2,]     → [1,2]
 *   - 调用表达式        Po([...])  → 保留原文（放进 _raw），不硬解析
 *   - 数字简写          .5 / 1e3   → 原样（JSON 都接受）
 */
function literalToJson(text, warnings) {
  let s = text;

  // 去尾随逗号（对象/数组）
  s = s.replace(/,(\s*[}\]])/g, "$1");

  // 单引号 → 双引号（只处理不在字符串内的，靠简单状态机）
  let out = "";
  let mode = "code";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (mode === "code") {
      if (c === "'") {
        mode = "sq";
        out += '"';
      } else if (c === '"') {
        mode = "dq";
        out += c;
      } else if (c === "`") {
        mode = "tpl";
        out += c;
      } else out += c;
    } else if (mode === "sq") {
      if (c === "\\") {
        out += c + (s[i + 1] ?? "");
        i++;
      } else if (c === "'") {
        mode = "code";
        out += '"';
      } else if (c === '"') {
        out += '\\"';
      } else out += c;
    } else if (mode === "dq") {
      if (c === "\\") {
        out += c + (s[i + 1] ?? "");
        i++;
      } else if (c === '"') {
        mode = "code";
        out += c;
      } else out += c;
    } else {
      out += c;
      if (c === "`" && mode === "tpl") mode = "code";
    }
  }
  s = out;

  // 无引号 key → 加引号
  s = s.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3');

  // 调用表达式（Po(...) / [].map(...) 等）无法转 JSON —— 标出来
  if (/\b[A-Za-z_$][\w$]*\s*\(/.test(s.replace(/"[^"]*"/g, '""'))) {
    if (warnings) warnings.push("含函数调用，_raw 保留原文，_json 可能不完整");
  }

  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: e.message, raw: s };
  }
}

// ─────────────────────────── 主流程 ───────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log(`用法: node extract-bundle-symbols.mjs <app.asar> [-o <outdir>] [--all]

  -o <outdir>   输出目录（默认 ./bundle-symbols）
  --all         除已知表外，额外 dump 扫描到的候选符号
  --list        只列出 asar 里的文件，不提取
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const asarPath = args[0];
  const oIdx = args.indexOf("-o");
  const outDir = oIdx >= 0 ? args[oIdx + 1] : "./bundle-symbols";
  const wantAll = args.includes("--all");
  const listOnly = args.includes("--list");

  if (!existsSync(asarPath)) {
    console.error(`✗ 找不到文件：${asarPath}`);
    process.exit(1);
  }

  console.log(`▸ 读取 ${asarPath}`);
  const hdr = await readAsarHeader(asarPath);
  console.log(`  header: strLen=${hdr.strLen} pad=${hdr.pad} dataStart=${hdr.dataStart}`);
  console.log(`  文件数: ${hdr.files.length}`);

  if (listOnly) {
    for (const f of hdr.files) console.log(`  ${String(f.size).padStart(9)}  ${f.path}`);
    await hdr.fh.close();
    return;
  }

  // 挑出 JS 文件
  const jsFiles = hdr.files.filter((f) => /\.(m?js|cjs)$/i.test(f.path));
  if (jsFiles.length === 0) {
    console.error("✗ asar 里没有 JS 文件，无法提取符号。");
    await hdr.fh.close();
    process.exit(1);
  }
  // 只列前 8 个 + 总数，避免大 app（500+ 文件）刷屏
  {
    const show = jsFiles.slice(0, 8).map((f) => `${f.path} (${(f.size / 1024).toFixed(0)}KB)`);
    const more = jsFiles.length > show.length ? ` … 共 ${jsFiles.length} 个` : "";
    console.log(`  JS 文件: ${show.join(", ")}${more}`);
  }

  // 读全部 JS 到内存
  const bundles = [];
  for (const f of jsFiles) {
    const buf = Buffer.alloc(f.size);
    await hdr.fh.read(buf, 0, f.size, hdr.dataStart + f.offset);
    bundles.push({ path: f.path, src: buf.toString("utf8") });
  }
  await hdr.fh.close();

  await mkdir(outDir, { recursive: true });
  const summary = { asar: path.basename(asarPath), header: { strLen: hdr.strLen, pad: hdr.pad, dataStart: hdr.dataStart }, bundles: jsFiles.map((f) => f.path), extracted: [] };

  // ── 已知符号 ──
  for (const t of TARGETS) {
    // 在所有 bundle 里找所有命中，取「表达式最长」的那个。
    // 不能取第一个命中：仓库里可能有作者手工切出来的片段文件
    // （如 geometry-raw.js），它同样含 u3=[[[ 但只是不完整的子集。
    // 真实 bundle 里的表达式一定最长，所以按长度取最大值是最稳的判据。
    const hits = [];
    if (process.env.DBG) console.error(`DBG ${t.name}: bundles=${bundles.length} lens=${bundles.map(x=>x.src.length).join(",")} anchor=${t.anchor}`);
    for (const b of bundles) {
      const re = new RegExp(t.anchor.source, "g");
      let m;
      while ((m = re.exec(b.src)) !== null) {
        const openIdx = m.index + (t.anchorOffset ?? m[0].length - 1); // anchorOffset = 匹配串内括号下标
        const span = matchBrackets(b.src, openIdx, []);
        if (span) hits.push({ bundle: b, span, len: span[1] - span[0] });
        re.lastIndex = m.index + m[0].length; // 避免零宽死循环
      }
    }

    if (!hits.length) {
      // ── 名字没命中 → 退回结构定位 ──
      // 压缩产物的变量名每版都变，硬编码名字必然随版本失效。
      // 结构定位器只看数据形状，不看名字，所以它是跨版本的主路径，
      // 名字匹配只是「快路径」（命中就省一次全量扫描）。
      const loc = STRUCT_LOCATORS.find((L) => L.kind === t.kind);
      if (loc) {
        for (const b of bundles) {
          let r = null;
          try {
            r = loc.find(b.src, matchBrackets);
          } catch (e) {
            if (process.env.DBG) console.log(`      [dbg] ${loc.name} 在 ${b.path} 抛错: ${e.message}`);
          }
          if (r) {
            console.log(`  ℹ️  ${t.name}: 名字未命中 → 结构定位到 \`${r.name}\`（${r.span[1] - r.span[0]} 字节，来自 ${b.path}）`);
            hits.push({ bundle: b, span: r.span, len: r.span[1] - r.span[0], viaStructure: r.name });
            break;
          }
        }
        if (process.env.DBG && !hits.length) {
          console.log(`      [dbg] ${loc.name}: 扫了 ${bundles.length} 个 bundle 都未命中`);
          console.log(`      [dbg] bundles: ${bundles.map((b) => b.path + "(" + b.src.length + ")").join(", ")}`);
        }
      }
      if (!hits.length) {
        console.log(`  ⚠️  ${t.name}: 未找到（锚点 ${t.anchor}，结构定位也未命中）`);
        summary.extracted.push({ name: t.name, status: "not-found" });
        continue;
      }
    }
    // 同长度时优先选「真实 bundle」而非作者手工切出来的片段文件。
    // 判据：片段文件名通常带 -raw 后缀；真实 bundle 名形如 index-<hash>.js。
    const bundleRank = (b) => {
      const n = b.path.toLowerCase();
      if (/-raw\./.test(n)) return 2;          // 作者手工切片，优先级最低
      if (/index[-.].*\.m?js$/.test(n)) return 0; // 真实打包产物
      return 1;
    };
    hits.sort((a, b2) => (b2.len - a.len) || (bundleRank(a.bundle) - bundleRank(b2.bundle)));
    const { bundle: whichBundle, span } = hits[0];
    if (hits.length > 1) {
      console.log(`  ℹ️  ${t.name}: ${hits.length} 处命中，取最长（${span[1] - span[0]} 字节，来自 ${whichBundle.path}）`);
    }

    const src = whichBundle.src;
    const exprText = src.slice(span[0], span[1]);
    const warnings = [];
    const res = literalToJson(exprText, warnings);

    // ── 检测「需要运行时求值」的表达式 ──
    // Jo 的值形如 Po("Blob", o_t(108,.075,1.1), {...})：路径是运行时算出来的，
    // 静态解析拿不到最终 path。上游 replica/ 就是为此重写了整个几何管线。
    // 这里如实标注，不假装能算。
    if (/\bPo\s*\(/.test(exprText)) {
      warnings.push(
        "值里含 Po(...) 运行时调用：静态提取只能拿到源码表达式，最终 path 需在浏览器里求值。" +
        " 可配合 --eval 或直接用 replica/ 的管线。"
      );
    }

    // ── verify 是最后一道关 ──
    // 压缩产物里同名符号可能是完全无关的东西。实测：旧版的 Jo（身形表）在
    // 新版包里命中了 React 的 `Jo={test:e=>e==="au"...}`，31 字节的无关函数。
    // 匹配成功但 verify 失败时必须丢弃，不能落盘当结果——否则输出目录里
    // 会混进一个看起来正常、实际是垃圾的 Jo.json。
    const verified = t.verify ? t.verify(res.value) : res.ok;
    if (!verified) {
      const why = res.ok
        ? `结构不符（${res.ok ? (Array.isArray(res.value) ? `array[${res.value.length}]` : typeof res.value) : "?"}，verify 未通过）`
        : `无法转 JSON（${String(res.error || "").slice(0, 60)}）`;
      console.log(`  ✗  ${t.name}: 命中 ${span[1] - span[0]} 字节但${why} → 丢弃`);
      console.log(`       命中内容: ${JSON.stringify(exprText.slice(0, 80))}…`);
      summary.extracted.push({
        name: t.name, status: "rejected", reason: why,
        bundle: whichBundle.path, byteRange: [span[0], span[1]], bytes: span[1] - span[0],
        hitSample: exprText.slice(0, 200),
      });
      continue;
    }

    const record = {
      name: t.name,
      kind: t.kind,
      desc: t.desc,
      status: "ok",
      needsRuntime: /\bPo\s*\(/.test(exprText),
      bundle: whichBundle.path,
      byteRange: [span[0], span[1]],
      bytes: exprText.length,
      warnings,
    };

    {
      const v = res.value;
      record.json = v;
      if (Array.isArray(v)) record.shape = `array[${v.length}]`;
      else if (v && typeof v === "object") record.shape = `object{${Object.keys(v).length}}`;
      await writeFile(path.join(outDir, `${t.name}.json`), JSON.stringify(v, null, 2));
      console.log(
        `  ✓  ${t.name}: ${record.shape}  → ${t.name}.json  (${(exprText.length / 1024).toFixed(1)}KB)${warnings.length ? "  ⚠️ " + warnings.join("; ") : ""}`
      );
    }

    summary.extracted.push(record);
  }

  // ── 候选符号扫描 ──
  console.log(`\n▸ 扫描其他候选表`);
  const candidates = [];
  for (const b of bundles) {
    // SVG path 常量（已烘焙的几何）：单独扫，因为它们不是「表」而是字符串字面量。
    // 真实包里 12 个里有 11 个是 UI 图标（Google/Slack 品牌色一眼可辨），
    // 只有紧跟眼睛表的那一个是角色几何。用 brandColors 标出可疑图标。
    {
      const svgHits = findSvgPathConstants(b.src);
      for (const h of svgHits) {
        candidates.push({
          name: h.name,
          kind: "svg-path",
          hint: h.looksLikeIcon
            ? `SVG path（坐标 ≤${h.maxAbs.toFixed(0)}，UI 图标${h.brandColors.length ? "：" + h.brandColors.join(",") : ""}）`
            : `SVG path（坐标 ≤${h.maxAbs.toFixed(0)}，疑似角色几何）`,
          bundle: b.path,
          at: h.at,
          len: h.len,
          expr: JSON.stringify(h.path),
          svgPath: h.path,
          brandColors: h.brandColors,
          looksLikeIcon: h.looksLikeIcon,
        });
      }
    }
    for (const p of SCAN_PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(b.src)) !== null) {
        const expr = m[0];
        // 往回找最近的 `xxx=`，把压缩变量名当候选名
        const before = b.src.slice(Math.max(0, m.index - 120), m.index);
        const nmMatch = before.match(/([A-Za-z_$][\w$]*)\s*=\s*$/);
        const nm = nmMatch ? nmMatch[1] : `${p.name}@${m.index}`;
        candidates.push({
          name: nm,
          kind: p.name,
          hint: p.hint,
          bundle: b.path,
          at: m.index,
          len: expr.length,
          expr,
        });
        p.re.lastIndex = m.index + expr.length;
      }
    }
  }
  // 已知的第三方库表（KaTeX 字体度量等），不是 bot 数据，过滤掉
  // 已知第三方库表的指纹：命中就丢掉，避免污染结果
  const LIB_SIGNS = [
    // KaTeX 字体度量
    /^(slant|space|stretch|shrink|xHeight|quad|extraSpace|num1|denom1|sup1|sub1|axisHeight|ruleThickness)$/,
    // CSS 具名颜色表（148 项，值是 [r,g,b] 整数数组）：命中率高就丢掉
    /^(transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|blanchedalmond|blueviolet|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|darkcyan|darkgoldenrod|darkgray|darkgreen|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dodgerblue|firebrick|floralwhite|forestgreen|gainsboro|ghostwhite|goldenrod|greenyellow|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightsteelblue|lightyellow|limegreen|linen|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|oldlace|olivedrab|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|skyblue|slateblue|slategray|snow|springgreen|steelblue|tan|thistle|tomato|turquoise|violet|wheat|whitesmoke|yellowgreen)$/,
    // PDF.js 图形算子
    /^(dependency|setLineWidth|setLineCap|setLineJoin|setMiterLimit|setDash|setRenderingIntent|setFlatness|setGState|save|restore|transform|moveTo|lineTo|curveTo|curveTo2|curveTo3|closePath|rectangle|stroke|fill|eoFill|clip|eoClip|beginText|endText|setCharSpacing|setWordSpacing|setHScale|setLeading|setFont|setTextRenderingMode|setTextRise|showText|moveText|setLeadingMoveText|nextLine|paintXObject|markPoint|markPointProps|beginMarkedContent|endMarkedContent|beginCompat|endCompat|paintFormXObjectBegin|paintFormXObjectEnd|beginGroup|endGroup|beginAnnotations|endAnnotations)$/,
    // 前端 IPC 方法注册表（值都是方法名数组，且 key 是 snake_case 领域词）
    /^(transcript|widgets|approvals|roster|cloud_agents|listeners)$/,
    // Tailwind 内部判定器
    /^(isAny|isAnyNonArbitrary|isArbitraryValue|isArbitraryVariable|isFraction|isNumber|isInteger|isPercent|isTshirtSize|isNamedContainerQuery|isArbitraryLength|isArbitraryNumber|isArbitraryPosition|isArbitrarySize)$/,
  ];
  for (let i = candidates.length - 1; i >= 0; i--) {
    const r = literalToJson(candidates[i].expr, []);
    const val = r.ok ? r.value : null;
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const keys = Object.keys(val);
    if (!keys.length) continue;
    for (const re of LIB_SIGNS) {
      const hit = keys.filter((k) => re.test(k)).length;
      if (hit / keys.length > 0.3) { candidates.splice(i, 1); break; }
    }
  }

  // 去重：同一个表达式可能同时出现在真实 bundle 和作者的 -raw 片段里
  {
    const seen = new Map();
    for (const c of candidates) {
      const key = c.kind + "|" + c.len;
      const prev = seen.get(key);
      if (!prev) { seen.set(key, c); continue; }
      // 同样长度同样类别，保留「非 -raw」的那个
      const better = /-raw\./.test(c.bundle) ? prev : c;
      candidates[candidates.indexOf(better === c ? prev : c)] = better;
    }
    const uniq = [...new Set(candidates)];
    candidates.length = 0;
    candidates.push(...uniq);
  }

  // 同 kind 只留最长的 3 个，避免刷屏
  const byKind = new Map();
  for (const c of candidates) {
    if (!byKind.has(c.kind)) byKind.set(c.kind, []);
    byKind.get(c.kind).push(c);
  }
  const picked = [];
  for (const [, arr] of byKind) {
    arr.sort((a, b) => b.len - a.len);
    picked.push(...arr.slice(0, 3));
  }
  picked.sort((a, b) => a.kind.localeCompare(b.kind) || b.len - a.len);
  candidates.length = 0;
  candidates.push(...picked);

  if (candidates.length === 0) {
    console.log("  （未扫到额外候选）");
  } else {
    for (const c of candidates) {
      // 尝试切段
      const b = bundles.find((x) => x.path === c.bundle);
      // SVG path 候选：值本身就是字符串字面量，不走括号配对
      if (c.kind === "svg-path") {
        if (wantAll) {
          await writeFile(
            path.join(outDir, `candidate-${c.name}.svgpath.txt`),
            c.svgPath
          );
        }
        console.log(
          `  · ${c.name}  [${c.hint}]  ${(c.len / 1024).toFixed(1)}KB${wantAll ? "  → 已导出" : ""}`
        );
        continue;
      }

      const declIdx = b.src.indexOf(`${c.name}=`, c.at - 200 > 0 ? c.at - 200 : 0);
      let shape = "?";
      let ok = false;
      if (declIdx >= 0) {
        const eq = b.src.indexOf("=", declIdx);
        let k = eq + 1;
        while (k < b.src.length && /\s/.test(b.src[k])) k++;
        const span = matchBrackets(b.src, k, []);
        if (span) {
          const txt = b.src.slice(span[0], span[1]);
          const r = literalToJson(txt, []);
          shape = `${(txt.length / 1024).toFixed(1)}KB`;
          ok = r.ok;
          if (wantAll) {
            if (r.ok) {
              await writeFile(path.join(outDir, `candidate-${c.name}.json`), JSON.stringify(r.value, null, 2));
            } else {
              await writeFile(path.join(outDir, `candidate-${c.name}.raw.js`), txt);
            }
          }
        }
      }
      console.log(`  ${ok ? "·" : "?"} ${c.name}  [${c.hint}]  ${shape}${wantAll ? "  → 已导出" : ""}`);
    }
    console.log(`  ${wantAll ? "" : "（加 --all 导出这些）"}`);
  }

  await writeFile(path.join(outDir, "_summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\n✓ 完成 → ${outDir}/`);
  console.log(`   _summary.json 记录每个符号的字节区间与来源 bundle`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
