# -*- coding: utf-8 -*-
"""把所有外連圖片抓回 repo，並改寫 content/ 裡的引用路徑。

原站的寵物圖等資源掛在 files.originmood.com、巴哈、gamerch 等第三方站，
外連隨時可能失效。這支把它們下載到 public/img/，內容層只留本地相對路徑。

用法:
  python scripts/fetch_images.py            # 下載 + 改寫
  python scripts/fetch_images.py --dry-run  # 只列出要抓什麼
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
import time
import unicodedata
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "content" / "data"
PAGES = ROOT / "content" / "pages"
IMGDIR = ROOT / "public" / "img"
MANIFEST = ROOT / "content" / "images.json"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
EXT_OK = {"gif", "png", "jpg", "jpeg", "webp", "svg", "bmp"}


def safe_name(text: str, fallback: str) -> str:
    text = unicodedata.normalize("NFKC", text).strip()
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", text)
    text = re.sub(r"\s+", "-", text).strip("-. ")
    return text[:60] or fallback


def ext_of(url: str, content_type: str = "") -> str:
    path = urllib.parse.urlparse(url).path
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    if ext in EXT_OK:
        return ext
    ct = content_type.split(";")[0].strip().lower()
    return {"image/gif": "gif", "image/png": "png", "image/jpeg": "jpg",
            "image/webp": "webp", "image/svg+xml": "svg"}.get(ct, "bin")


def looks_like_image(data: bytes) -> bool:
    """用檔頭確認真的是圖。

    有些站台圖沒了不回 404，而是回一頁 HTTP 200 的錯誤頁面。不擋的話會被當成
    下載成功、存成 .bin 再寫進 CSV，網頁上就是一個破圖，而且「檔案存在」的
    檢查抓不出來（劇毒螃蟹就是這樣壞掉的）。
    """
    if data[:4] == b"GIF8" or data[:8] == b"\x89PNG\r\n\x1a\n" or data[:3] == b"\xff\xd8\xff":
        return True
    if data[:2] == b"BM" or (data[:4] == b"RIFF" and data[8:12] == b"WEBP"):
        return True
    head = data[:1024].lstrip()
    return head.startswith(b"<?xml") or head.startswith(b"<svg")  # SVG 是純文字


def load_manifest() -> dict:
    if MANIFEST.exists():
        try:
            return json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            pass
    return {"map": {}, "failures": []}


def collect(reserved: set[str] | None = None) -> dict[str, str]:
    """回傳 {url: 建議的本地相對路徑(不含副檔名)}。名稱盡量可讀，方便編輯者辨認。

    已成功下載的網址在 CSV/Markdown 裡已被改寫成 /img/...，不會再被收集；
    reserved 用來保留這些既有檔名，避免重跑時新圖蓋掉舊圖。
    """
    plan: dict[str, str] = {}
    seen_names: set[str] = set(reserved or ())

    def claim(folder: str, base: str, url: str) -> str:
        base = safe_name(base, hashlib.sha1(url.encode()).hexdigest()[:10])
        cand, i = f"{folder}/{base}", 2
        while cand in seen_names:
            cand, i = f"{folder}/{base}-{i}", i + 1
        seen_names.add(cand)
        return cand

    for csv_path in sorted(DATA.glob("*.csv")):
        with csv_path.open(encoding="utf-8-sig", newline="") as fh:
            rows = list(csv.reader(fh))
        if not rows or "image" not in rows[0]:
            continue
        col = rows[0].index("image")
        folder = safe_name(csv_path.stem, "data")
        for r in rows[1:]:
            if col >= len(r):
                continue
            url = r[col].strip()
            if not url.startswith("http") or url in plan:
                continue
            label = next((c for c in r[:col] if c.strip()), "")
            plan[url] = claim(folder, label, url)

    for md in PAGES.rglob("*.md"):
        text = md.read_text(encoding="utf-8")
        for url in re.findall(r"!\[[^\]]*\]\((https?://[^)\s]+)\)", text):
            # Google Sites 內文圖的網址有時效，離線重抓一定 403，
            # 由 fetch_page_images.py 用「重抓頁面 + 位置對應」處理。
            if "googleusercontent.com/sitesv/" in url:
                continue
            if url not in plan:
                plan[url] = claim("pages", md.stem, url)
    return plan


def referer_for(host: str) -> str:
    # googleusercontent 上的圖是 Google Sites 託管的，Referer 必須是 sites.google.com，
    # 指到 googleusercontent 自己會被回 403。
    if host.endswith("googleusercontent.com"):
        return "https://sites.google.com/"
    return f"https://{host}/"


def download(url: str, stem: str, attempts: int = 4) -> tuple[str, str | None, str]:
    """回傳 (url, 本地相對路徑或 None, 訊息)。403/429/5xx 會退避重試。"""
    host = urllib.parse.urlparse(url).netloc
    headers = {"User-Agent": UA, "Referer": referer_for(host),
               "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"}
    last = "?"
    for i in range(attempts):
        try:
            resp = requests.get(url, headers=headers, timeout=40)
            if resp.status_code == 200 and resp.content:
                if not looks_like_image(resp.content):
                    return url, None, "not-an-image"
                ext = ext_of(url, resp.headers.get("Content-Type", ""))
                rel = f"{stem}.{ext}"
                dest = IMGDIR / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(resp.content)
                return url, rel, f"{len(resp.content)//1024}KB"
            last = f"HTTP {resp.status_code}" if resp.status_code != 200 else "empty"
            # 404 是真的沒了，重試沒意義
            if resp.status_code == 404:
                return url, None, last
        except Exception as exc:  # noqa: BLE001
            last = type(exc).__name__
        if i < attempts - 1:
            time.sleep(1.5 * (2 ** i) + random.random())
    return url, None, last


def rewrite(mapping: dict[str, str]) -> tuple[int, int]:
    """把 CSV 與 Markdown 裡的外連網址換成 /img/... 本地路徑。"""
    csv_hits = md_hits = 0
    for csv_path in sorted(DATA.glob("*.csv")):
        with csv_path.open(encoding="utf-8-sig", newline="") as fh:
            rows = list(csv.reader(fh))
        if not rows or "image" not in rows[0]:
            continue
        col = rows[0].index("image")
        changed = False
        for r in rows[1:]:
            if col < len(r) and r[col].strip() in mapping:
                r[col] = "/img/" + mapping[r[col].strip()]
                changed = True
                csv_hits += 1
        if changed:
            with csv_path.open("w", encoding="utf-8-sig", newline="") as fh:
                csv.writer(fh).writerows(rows)

    for md in PAGES.rglob("*.md"):
        text = original = md.read_text(encoding="utf-8")
        for url, rel in mapping.items():
            if url in text:
                text = text.replace(f"]({url})", f"](/img/{rel})")
        if text != original:
            md.write_text(text, encoding="utf-8")
            md_hits += 1
    return csv_hits, md_hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=12)
    args = ap.parse_args()

    prior = load_manifest()
    prior_map: dict[str, str] = {u: p[len("/img/"):] for u, p in prior.get("map", {}).items()}
    reserved = {p.rsplit(".", 1)[0] for p in prior_map.values()}
    plan = collect(reserved)

    # 轉換器重跑會把 content/ 整個重生，引用又變回外連網址。
    # 檔案其實還在，所以先認領既有的本地檔，只補真正缺的。
    reused: dict[str, str] = {}
    for url in list(plan):
        rel = prior_map.get(url)
        if rel and (IMGDIR / rel).exists():
            reused[url] = rel
            del plan[url]
    if reused:
        print(f"沿用已下載 {len(reused)} 張")

    hosts: dict[str, int] = {}
    for u in plan:
        hosts[urllib.parse.urlparse(u).netloc] = hosts.get(urllib.parse.urlparse(u).netloc, 0) + 1
    print(f"待下載 {len(plan)} 張")
    for h, n in sorted(hosts.items(), key=lambda x: -x[1]):
        print(f"  {n:5d}  {h}")
    if args.dry_run:
        for u, s in list(plan.items())[:10]:
            print(f"   {s}  ←  {u[:80]}")
        return 0

    IMGDIR.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, str] = dict(reused)
    failures: list[tuple[str, str]] = []
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(download, u, s): u for u, s in plan.items()}
        for fut in as_completed(futs):
            url, rel, msg = fut.result()
            done += 1
            if rel:
                mapping[url] = rel
            else:
                failures.append((url, msg))
            if done % 100 == 0 or done == len(plan):
                print(f"  {done}/{len(plan)}  ok={len(mapping)} fail={len(failures)}")

    csv_hits, md_hits = rewrite(mapping)
    merged = {**prior_map, **mapping}
    MANIFEST.write_text(json.dumps(
        {"downloaded": len(merged), "failed": len(failures),
         "map": {u: "/img/" + r for u, r in sorted(merged.items())},
         "failures": [{"url": u, "reason": m} for u, m in sorted(failures)]},
        ensure_ascii=False, indent=1), encoding="utf-8")

    total = sum(f.stat().st_size for f in IMGDIR.rglob("*") if f.is_file())
    print(f"\n本輪成功 {len(mapping)} / 失敗 {len(failures)}｜累計 {len(merged)} 張、{total/1024/1024:.1f} MB")
    print(f"改寫 CSV {csv_hits} 格、Markdown {md_hits} 檔")
    if failures:
        print("失敗清單（前 10）:")
        for u, m in failures[:10]:
            print(f"  {m:<14} {u[:90]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
