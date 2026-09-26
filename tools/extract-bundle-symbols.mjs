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
    name: "snt",
    kind: "palette",
    desc: "11 色板（对象，key → 颜色值）",
    shape: "brackets",
    anchor: /\bsnt\s*=\s*\{/,
    anchorOffset: 4, // "snt={" 里 "{" 的下标
    verify: (v) => v && typeof v === "object" && Object.keys(v).length >= 5,
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
    name: "state-eye-map",
    hint: "状态 → 眼睛多边形下标集合（解释 morph 目标）",
    // {sleeping:[13,22,4],waking:[13],idle:[0,8],...}
    re: /\{[a-z][\w-]*:\[[\d,\s]*\](?:,[a-z][\w-]*:\[[\d,\s]*\]){5,}\}/g,
    verify: (v) => v && typeof v === "object" && Object.keys(v).length >= 6,
  },
  {
    name: "state-timings",
    hint: "状态时长表（毫秒）",
    // {progress:2500,spawning:2e3,...}
    re: /\{[a-z][\w-]*:(?:\d+e?\d*|null)(?:,[a-z][\w-]*:(?:\d+e?\d*|null)){4,}\}/g,
    verify: (v) => v && typeof v === "object" && Object.keys(v).length >= 5,
  },
  {
    name: "state-sequences",
    hint: "状态序列（按类别分组的字符串数组）",
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
  console.log(`  JS 文件: ${jsFiles.map((f) => `${f.path} (${(f.size / 1024).toFixed(0)}KB)`).join(", ")}`);

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
      console.log(`  ⚠️  ${t.name}: 未找到（锚点 ${t.anchor}）`);
      summary.extracted.push({ name: t.name, status: "not-found" });
      continue;
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

    const record = {
      name: t.name,
      kind: t.kind,
      desc: t.desc,
      status: res.ok ? "ok" : "partial",
      needsRuntime: /\bPo\s*\(/.test(exprText),
      bundle: whichBundle.path,
      byteRange: [span[0], span[1]],
      bytes: exprText.length,
      warnings,
    };

    if (res.ok) {
      let v = res.value;
      if (t.verify && !t.verify(v)) {
        record.status = "verify-failed";
        warnings.push("内容形状与预期不符");
      }
      record.json = v;
      if (Array.isArray(v)) record.shape = `array[${v.length}]`;
      else if (v && typeof v === "object") record.shape = `object{${Object.keys(v).length}}`;
      await writeFile(path.join(outDir, `${t.name}.json`), JSON.stringify(v, null, 2));
      console.log(
        `  ✓  ${t.name}: ${record.shape}  → ${t.name}.json  (${(exprText.length / 1024).toFixed(1)}KB)${warnings.length ? "  ⚠️ " + warnings.join("; ") : ""}`
      );
    } else {
      record.raw = exprText;
      await writeFile(path.join(outDir, `${t.name}.raw.js`), exprText);
      console.log(`  ⚠️  ${t.name}: 无法直接转 JSON（${res.error}）→ ${t.name}.raw.js`);
    }

    summary.extracted.push(record);
  }

  // ── 候选符号扫描 ──
  console.log(`\n▸ 扫描其他候选表`);
  const candidates = [];
  for (const b of bundles) {
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
  const FP = /^(slant|space|stretch|shrink|xHeight|quad|extraSpace|num1|denom1|sup1|sub1|axisHeight|ruleThickness|defaultRuleThickness|bigOpSpacing|sqrtRuleThickness)$/;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const r = literalToJson(candidates[i].expr, []);
    const keys = r.ok && r.value && typeof r.value === "object" && !Array.isArray(r.value)
      ? Object.keys(r.value) : [];
    if (keys.length && keys.filter((k) => FP.test(k)).length / keys.length > 0.5) {
      candidates.splice(i, 1);
    }
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
