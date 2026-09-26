#!/usr/bin/env python3
"""
mk-asar-fixture.py — 造 pad 可控的 spec-correct asar 测试样本

用途：验证 extract-asar.js 的 dataStart off-by-one。
Chromium Pickle 会把 header JSON 补到 4 字节边界，pad = (4 - jsonLen%4) % 4。
本脚本构造 4 个 pad 值各不相同的 asar，用来检查提取工具是否在任何 pad 下都正确。

    python3 mk-asar-fixture.py <src_dir> <out_prefix>

会产出 <out_prefix>-pad0.asar .. -pad3.asar
"""
import json, struct, os, sys

def build(src_dir, pad_want, out, nfiles=0):
    files = {}
    for root, _, fs in os.walk(src_dir):
        for f in fs:
            full = os.path.join(root, f)
            files[os.path.relpath(full, src_dir)] = open(full, "rb").read()
    target_mod = (4 - pad_want) % 4
    for L in range(1, 800):
        fl = dict(files)
        for k in range(nfiles):
            fl["pad%d%s.bin" % (k, "y" * L)] = b"\x00" * 10
        hdr, blobs = {"files": {}}, []
        for p in sorted(fl):
            parts = p.split("/")
            node = hdr
            for seg in parts[:-1]:
                node["files"].setdefault(seg, {"files": {}})
                node = node["files"][seg]
            node["files"][parts[-1]] = {
                "size": len(fl[p]),
                "offset": str(sum(len(b) for b in blobs)),
            }
            blobs.append(fl[p])
        j = json.dumps(hdr, separators=(",", ":")).encode()
        if len(j) % 4 == target_mod:
            inner = struct.pack("<I", len(j)) + j
            inner += b"\x00" * ((4 - len(inner) % 4) % 4)
            pk = struct.pack("<I", len(inner)) + struct.pack("<I", 4)
            open(out, "wb").write(struct.pack("<I", 4) + pk + inner + b"".join(blobs))
            pad = (4 - len(j) % 4) % 4
            print("%s: jsonLen=%d pad=%d dataStart=%d" % (out, len(j), pad, 16 + len(j) + pad))
            return
    raise SystemExit("no filename length fits pad=%d" % pad_want)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(1)
    src, prefix = sys.argv[1], sys.argv[2]
    for i, pad in enumerate((0, 1, 2, 3)):
        build(src, pad, "%s-pad%d.asar" % (prefix, pad), nfiles=i)
