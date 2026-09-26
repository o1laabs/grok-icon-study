import json, struct, os, sys

def build(src_dir, pad_want, out):
    files = {}
    for root, _, fs in os.walk(src_dir):
        for f in fs:
            files[os.path.relpath(os.path.join(root, f), src_dir)] = open(os.path.join(root, f), "rb").read()
    target_mod = (4 - pad_want) % 4
    # 用「dummy 文件个数 × 名字长度」两个维度扫，保证 4 个 mod 都能命中
    for ndummy in range(0, 12):
        for L in range(0, 60):
            fl = dict(files)
            for k in range(ndummy):
                fl["p%d%s.bin" % (k, "y" * L)] = b"\x00" * (10 + L)
            hdr, blobs = {"files": {}}, []
            for p in sorted(fl):
                parts = p.split("/")
                node = hdr
                for seg in parts[:-1]:
                    node["files"].setdefault(seg, {"files": {}})
                    node = node["files"][seg]
                node["files"][parts[-1]] = {"size": len(fl[p]), "offset": str(sum(len(b) for b in blobs))}
                blobs.append(fl[p])
            j = json.dumps(hdr, separators=(",", ":")).encode()
            if len(j) % 4 == target_mod:
                inner = struct.pack("<I", len(j)) + j
                inner += b"\x00" * ((4 - len(inner) % 4) % 4)
                pk = struct.pack("<I", len(inner)) + struct.pack("<I", 4)
                open(out, "wb").write(struct.pack("<I", 4) + pk + inner + b"".join(blobs))
                pad = (4 - len(j) % 4) % 4
                print("%s: jsonLen=%d pad=%d dataStart=%d ndummy=%d" % (out, len(j), pad, 16 + len(j) + pad, ndummy))
                return
    raise SystemExit("no fit for pad=%d" % pad_want)

if __name__ == "__main__":
    src, prefix = sys.argv[1], sys.argv[2]
    for pad in (0, 1, 2, 3):
        build(src, pad, "%s-pad%d.asar" % (prefix, pad))
