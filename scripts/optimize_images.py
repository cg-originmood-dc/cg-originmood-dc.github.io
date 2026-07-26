# -*- coding: utf-8 -*-
"""無損壓縮 public/img 底下的圖片。

「無損」不是信工具的旗標就算數，每張圖壓完都會重新解碼比對，對不上就丟掉不寫回。

PNG  用 oxipng（重選 filter 與 zlib 參數）
GIF  用 gifsicle -O3（重算 frame diff 與 local palette）
JPEG 用 jpegtran（重排 Huffman 表、改漸進式掃描；DCT 係數不動，不是重新編碼）

比對動畫 GIF 有三個坑，天真地逐幀比 bytes 會誤判成失真：

1. **合成方式**：GIF 每幀只存跟前一幀的差異，還要看 disposal method 疊。
   直接讓 Pillow 疊會跟瀏覽器不一樣，所以先用 `gifsicle -U` 把每幀還原成
   完整畫面再比，等於拿 gifsicle 自己當公證人。
2. **重複幀合併**：-O3 會把連續相同的幀併成一幀、延長 delay。畫面完全一樣但
   幀數不同（白銀巨龍 114 幀→29 幀，總時長不變）。所以比的是**時間軸**——
   每個時刻該顯示什麼——而不是幀陣列。
3. **透明像素的 RGB**：完全透明的像素其 RGB 根本不會畫出來，gifsicle 常換掉
   它的調色盤索引。比對前先把 alpha=0 的像素正規化。

用法:
  python scripts/optimize_images.py --dry-run   # 只看能省多少
  python scripts/optimize_images.py             # 實際壓縮
  python scripts/optimize_images.py --jobs 8
"""
from __future__ import annotations

import argparse
import io
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parent.parent
IMGDIR = ROOT / "public" / "img"


def vendor_bin(pkg: str, name: str) -> str | None:
    exe = f"{name}.exe" if sys.platform == "win32" else name
    p = ROOT / "node_modules" / pkg / "vendor" / exe
    return str(p) if p.exists() else None


def gifsicle_bin() -> str | None:
    return vendor_bin("gifsicle", "gifsicle")


def jpegtran_bin() -> str | None:
    return vendor_bin("jpegtran-bin", "jpegtran")


def gifsicle(args: list[str], data: bytes, exe: str) -> bytes | None:
    try:
        r = subprocess.run([exe, *args], input=data, capture_output=True, timeout=300)
        return r.stdout if r.returncode == 0 and r.stdout else None
    except Exception:  # noqa: BLE001
        return None


def canon(im: Image.Image) -> bytes:
    """一幀畫面的正規形式。完全透明的像素其 RGB 畫不出來，一律歸零再比。"""
    a = np.array(im.convert("RGBA"))
    a[a[:, :, 3] == 0] = 0
    return a.tobytes()


def frames_of(data: bytes) -> list[bytes]:
    with Image.open(io.BytesIO(data)) as im:
        return [canon(f) for f in ImageSequence.Iterator(im)]


def timeline_of(data: bytes, exe: str) -> list[tuple[int, bytes]] | None:
    """展開成 [(累計毫秒, 畫面)]，代表這動畫在每個時刻該顯示什麼。"""
    flat = gifsicle(["-U"], data, exe)
    if not flat:
        return None
    out: list[tuple[int, bytes]] = []
    t = 0
    with Image.open(io.BytesIO(flat)) as im:
        for f in ImageSequence.Iterator(im):
            t += f.info.get("duration") or 0
            out.append((t, canon(f)))
    return out


def same_animation(before: bytes, after: bytes, exe: str) -> bool:
    """兩個動畫在每一個時刻顯示的畫面都相同。幀怎麼切、切幾刀都不算數。"""
    ta, tb = timeline_of(before, exe), timeline_of(after, exe)
    if not ta or not tb or ta[-1][0] != tb[-1][0]:
        return False
    i = j = 0
    while i < len(ta) and j < len(tb):
        if ta[i][1] != tb[j][1]:
            return False
        # 誰的區間先結束就推進誰；同時結束就兩邊一起推，
        # 只推一邊的話後面每一段都會錯開一格，好圖也會被判成失真。
        if ta[i][0] == tb[j][0]:
            i, j = i + 1, j + 1
        elif ta[i][0] < tb[j][0]:
            i += 1
        else:
            j += 1
    return True


def lossless(before: bytes, after: bytes, exe: str | None) -> bool:
    try:
        fa, fb = frames_of(before), frames_of(after)
        if not fa:
            return False
        if fa == fb:  # 靜態圖與多數 GIF 走這條，不必動用 gifsicle
            return True
        if len(fa) == 1 or not exe:
            return False
        return same_animation(before, after, exe)
    except Exception:  # noqa: BLE001
        return False


def squeeze_png(data: bytes) -> bytes | None:
    import oxipng
    try:
        # strip=Safe 只丟掉不影響畫面的中繼資料（時間戳、文字註解…）
        return oxipng.optimize_from_memory(data, level=5, strip=oxipng.StripChunks.safe())
    except Exception:  # noqa: BLE001
        return None


def squeeze_jpeg(data: bytes, exe: str) -> bytes | None:
    # -copy none 只丟中繼資料，-optimize/-progressive 只重排編碼，像素不動
    try:
        r = subprocess.run([exe, "-copy", "none", "-optimize", "-progressive"],
                           input=data, capture_output=True, timeout=120)
        return r.stdout if r.returncode == 0 and r.stdout else None
    except Exception:  # noqa: BLE001
        return None


def process(path: Path, tools: dict[str, str | None], dry: bool) -> tuple[Path, int, int, str]:
    """回傳 (檔案, 原大小, 新大小, 狀態)。"""
    data = path.read_bytes()
    ext = path.suffix.lower()
    exe = tools["gif"]
    if ext == ".png":
        out = squeeze_png(data)
    elif ext == ".gif" and exe:
        out = gifsicle(["-O3", "--no-warnings", "--careful"], data, exe)
    elif ext in {".jpg", ".jpeg"} and tools["jpeg"]:
        out = squeeze_jpeg(data, tools["jpeg"])
    else:
        return path, len(data), len(data), "skip"

    if not out:
        return path, len(data), len(data), "fail"
    if len(out) >= len(data):
        return path, len(data), len(data), "nogain"
    if not lossless(data, out, exe):
        return path, len(data), len(data), "LOSSY!"
    if not dry:
        path.write_bytes(out)
    return path, len(data), len(out), "ok"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--jobs", type=int, default=6)
    ap.add_argument("--limit", type=int, help="只處理前 N 個大檔，用來試水溫")
    args = ap.parse_args()

    tools = {"gif": gifsicle_bin(), "jpeg": jpegtran_bin()}
    if not tools["gif"]:
        print("找不到 gifsicle，GIF 會被跳過（npm install gifsicle）", file=sys.stderr)
    if not tools["jpeg"]:
        print("找不到 jpegtran，JPEG 會被跳過（npm install jpegtran-bin）", file=sys.stderr)

    exts = {".png", ".gif", ".jpg", ".jpeg"}
    files = [p for p in IMGDIR.rglob("*") if p.is_file() and p.suffix.lower() in exts]
    files.sort(key=lambda p: -p.stat().st_size)
    if args.limit:
        files = files[:args.limit]
    print(f"待處理 {len(files)} 個檔案{'（試跑，不寫回）' if args.dry_run else ''}")

    before = after = 0
    stats: dict[str, int] = {}
    lossy: list[Path] = []
    done = 0
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futs = [pool.submit(process, p, tools, args.dry_run) for p in files]
        for f in as_completed(futs):
            path, b, a, st = f.result()
            before += b
            after += a
            stats[st] = stats.get(st, 0) + 1
            if st == "LOSSY!":
                lossy.append(path)
            done += 1
            if done % 200 == 0 or done == len(files):
                print(f"  {done}/{len(files)}  目前省下 {(before-after)/1048576:.1f} MB")

    print(f"\n原始 {before/1048576:.1f} MB → {after/1048576:.1f} MB"
          f"（省下 {(before-after)/1048576:.1f} MB，{(1-after/before)*100:.1f}%）")
    print("狀態:", ", ".join(f"{k}={v}" for k, v in sorted(stats.items())))
    if lossy:
        print(f"\n!! {len(lossy)} 個檔案壓完像素不一致，已保留原檔：")
        for p in lossy[:10]:
            print("   ", p)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
