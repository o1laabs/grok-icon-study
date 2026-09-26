// Minimal repro of extract-asar.js dataStart off-by-one.
// Payload must be named like an icon so the extractor's filter picks it up.
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SCRIPT = process.argv[2];
const results = [];

for (const targetLen of [100, 101, 102, 103]) {
  // build header JSON whose serialized length == targetLen
  let hdr = null;
  for (let extra = 0; extra < 80; extra++) {
    const name = "icon" + "z".repeat(extra) + ".png";
    const o = { files: { [name]: { size: 8, offset: "0" } } };
    if (JSON.stringify(o).length === targetLen) { hdr = o; break; }
  }
  if (!hdr) { results.push({ targetLen, skipped: true }); continue; }

  const j = Buffer.from(JSON.stringify(hdr));
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(j.length);
  let inner = Buffer.concat([lenBuf, j]);
  const pad = (4 - (inner.length % 4)) % 4;
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
