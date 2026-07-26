# -*- coding: utf-8 -*-
"""檢查 content/ 引用到的每一張本地圖片是不是真的能顯示。

只驗「檔案存在」是不夠的：有些站台圖沒了會回一頁 HTTP 200 的 HTML 錯誤頁，
下載腳本照收，存成一個看起來很正常的檔案寫進 CSV，網頁上卻是破圖。
所以這裡要求每個引用都能真的解碼成圖片。

順便列出沒有被任何地方引用的孤兒圖，清理時可以參考。

用法:
  python scripts/check_images.py
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "content" / "data"
PAGES = ROOT / "content" / "pages"
PUBLIC = ROOT / "public"

MD_IMG = re.compile(r"!\[[^\]]*\]\(([^)\s]+)\)")
HTML_IMG = re.compile(r"""<img[^>]+src=["']([^"']+)["']""")


def references() -> dict[str, list[str]]:
    """{ /img/... : [是誰引用的] }"""
    refs: dict[str, list[str]] = {}

    def add(url: str, where: str) -> None:
        if url.startswith("/img/"):
            refs.setdefault(url, []).append(where)

    for path in sorted(DATA.glob("*.csv")):
        with path.open(encoding="utf-8-sig", newline="") as fh:
            for n, row in enumerate(csv.reader(fh), 1):
                for cell in row:
                    add(cell.strip(), f"{path.name}:{n}")

    for md in sorted(PAGES.rglob("*.md")):
        text = md.read_text(encoding="utf-8")
        rel = md.relative_to(PAGES).as_posix()
        for pat in (MD_IMG, HTML_IMG):
            for url in pat.findall(text):
                add(url.split("#")[0].split("?")[0], rel)

    # 版面裡也會直接指定圖（側欄 logo 等），不掃的話會被誤報成沒人用
    for src in sorted((ROOT / "src").rglob("*.astro")):
        for url in re.findall(r"/img/[^\s\"'`)]+", src.read_text(encoding="utf-8")):
            add(url, src.relative_to(ROOT).as_posix())
    return refs


def main() -> int:
    refs = references()
    missing: list[tuple[str, str]] = []
    broken: list[tuple[str, str]] = []
    ok = 0

    for url, where in sorted(refs.items()):
        path = PUBLIC / url.lstrip("/")
        if not path.exists():
            missing.append((url, where[0]))
            continue
        try:
            with Image.open(path) as im:
                im.verify()
            ok += 1
        except Exception as exc:  # noqa: BLE001
            broken.append((url, f"{where[0]} — {type(exc).__name__}"))

    used = {(PUBLIC / u.lstrip("/")).resolve() for u in refs}
    orphans = [p for p in (PUBLIC / "img").rglob("*")
               if p.is_file() and p.resolve() not in used]

    print(f"引用 {len(refs)} 個路徑：可正常解碼 {ok}，檔案不存在 {len(missing)}，"
          f"存在但不是圖 {len(broken)}")
    for title, items in (("檔案不存在", missing), ("存在但不是圖", broken)):
        if items:
            print(f"\n{title}:")
            for url, where in items[:30]:
                print(f"  {url}   ({where})")
            if len(items) > 30:
                print(f"  …還有 {len(items)-30} 個")
    if orphans:
        size = sum(p.stat().st_size for p in orphans)
        print(f"\n沒有被引用的圖 {len(orphans)} 個（{size/1048576:.1f} MB）:")
        for p in orphans[:15]:
            print(f"  {p.relative_to(PUBLIC).as_posix()}")
        if len(orphans) > 15:
            print(f"  …還有 {len(orphans)-15} 個")
    return 1 if missing or broken else 0


if __name__ == "__main__":
    raise SystemExit(main())
