# -*- coding: utf-8 -*-
"""抓回內文裡的 Google Sites 圖片。

Google Sites 現在把圖片放在 lh3.googleusercontent.com/sitesv/... ，這種網址是
隨頁面渲染簽發、有時效的：離線快取一小時後再抓就是 403（連登入的瀏覽器也一樣）。
所以不能靠「網址」對應，得靠「位置」——重新抓一次頁面，把該頁第 n 張圖
存成固定路徑 public/img/pages/<頁面>/<n>.<ext>，再回填 Markdown 的第 n 個引用。

走訪順序沿用 extract.py 的 prepare_soup + block_to_md，兩邊保證一致。

用法:
  python scripts/fetch_page_images.py
"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import block_to_md, page_path_from_url, prepare_soup, slugify_filename  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PAGES = ROOT / "content" / "pages"
IMGDIR = ROOT / "public" / "img" / "pages"
MANIFEST = ROOT / "content" / "images.json"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
MD_IMG = re.compile(r"!\[[^\]]*\]\((https?://[^)\s]+)\)")
# 重跑時要看「所有」圖片引用（含已改寫成 /img/... 的），位置才對得回去。
# 只挑還沒抓到的那幾張來配對，會把它們錯配到第 1、2 張圖上。
MD_IMG_ANY = re.compile(r"!\[[^\]]*\]\(([^)\s]+)\)")


def ext_from(url: str, content_type: str) -> str:
    ct = content_type.split(";")[0].strip().lower()
    by_ct = {"image/gif": "gif", "image/png": "png", "image/jpeg": "jpg",
             "image/webp": "webp", "image/svg+xml": "svg"}
    if ct in by_ct:
        return by_ct[ct]
    path = urllib.parse.urlparse(url).path
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return ext if ext in {"gif", "png", "jpg", "jpeg", "webp"} else "png"


def process(entry: dict) -> dict:
    """重抓一頁，下載它的內文圖片，回填 Markdown。"""
    segments = page_path_from_url(entry["url"])
    md_path = PAGES.joinpath(*segments).with_suffix(".md")
    result = {"page": "/".join(segments), "downloaded": 0, "expected": 0, "note": ""}
    if not md_path.exists():
        result["note"] = "markdown 不存在"
        return result

    text = md_path.read_text(encoding="utf-8")
    old_urls = MD_IMG_ANY.findall(text)
    todo_idx = [i for i, u in enumerate(old_urls) if u.startswith("http")]
    if not todo_idx:
        return result
    result["expected"] = len(todo_idx)

    sess = requests.Session()
    sess.headers["User-Agent"] = UA
    try:
        resp = sess.get(entry["url"], timeout=45)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        result["note"] = f"重抓頁面失敗 {type(exc).__name__}"
        return result

    fresh: list[str] = []
    soup = prepare_soup(resp.text)
    for block in soup.select("div.oKdM2c"):
        block_to_md(block, fresh)

    if len(fresh) != len(old_urls):
        result["note"] = f"⚠ 圖片數不符 舊{len(old_urls)} 新{len(fresh)}，位置可能錯位"

    stem = "/".join(slugify_filename(s) for s in segments)
    for idx in todo_idx:
        if idx >= len(fresh):
            continue
        old, new, i = old_urls[idx], fresh[idx], idx + 1
        try:
            r = sess.get(new, timeout=45, headers={"Referer": "https://sites.google.com/"})
            if r.status_code != 200 or not r.content:
                continue
            rel = f"{stem}/{i}.{ext_from(new, r.headers.get('Content-Type',''))}"
            dest = IMGDIR / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(r.content)
            text = text.replace(f"]({old})", f"](/img/pages/{rel})")
            result["downloaded"] += 1
        except Exception:  # noqa: BLE001
            continue

    md_path.write_text(text, encoding="utf-8")
    return result


def main() -> int:
    index = json.loads((ROOT / ".cache" / "index.json").read_text(encoding="utf-8"))
    todo = []
    for entry in index:
        segments = page_path_from_url(entry["url"])
        md_path = PAGES.joinpath(*segments).with_suffix(".md")
        if md_path.exists() and MD_IMG.search(md_path.read_text(encoding="utf-8")):
            todo.append(entry)
    print(f"需要抓內文圖片的頁面：{len(todo)}")

    results = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(process, e): e for e in todo}
        for fut in as_completed(futs):
            r = fut.result()
            results.append(r)
            flag = "" if r["downloaded"] == r["expected"] else "  ⚠"
            print(f"  {r['downloaded']:3d}/{r['expected']:<3d} {r['page'][:52]}{flag} {r['note']}")

    got = sum(r["downloaded"] for r in results)
    want = sum(r["expected"] for r in results)
    print(f"\n內文圖片 {got}/{want} 張")

    # 併入既有的圖片清單，記錄這批是用位置對應抓的
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    manifest["pageImages"] = {"downloaded": got, "expected": want,
                              "note": "Google Sites /sitesv/ 網址有時效，改以頁內位置對應抓取"}
    manifest["failures"] = [f for f in manifest.get("failures", [])
                            if "googleusercontent" not in f["url"]]
    manifest["failed"] = len(manifest["failures"]) + (want - got)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
