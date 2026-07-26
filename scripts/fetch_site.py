# -*- coding: utf-8 -*-
"""抓取 Google Sites 全站原始 HTML 到 .cache/raw/。

兩種來源模式：
  public  — 已發佈的站台，免登入，網址是 /view/<name>/<中文路徑>
  private — 私有副本，需登入 cookie，網址是 /d/<siteId>/p/<pageId>/preview

用法:
  python scripts/fetch_site.py --mode public  --root https://sites.google.com/view/goodluck2cg/
  python scripts/fetch_site.py --mode private --site-id 14cZY9g0X1_wUsregGcbLvAVC3Xowcm7e --cookies .cache/cookies.json
"""
from __future__ import annotations

import argparse
import hashlib
import html as htmlmod
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / ".cache" / "raw"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def slug_for(url: str, prefix: str) -> str:
    """把網址轉成穩定的檔名。中文路徑保留可讀性，過長則用雜湊。"""
    path = urllib.parse.urlparse(url).path
    rel = path[len(prefix):] if path.startswith(prefix) else path
    rel = urllib.parse.unquote(rel).strip("/")
    if not rel:
        rel = "index"
    safe = re.sub(r'[<>:"\\|?*]', "_", rel).replace("/", "__")
    if len(safe.encode("utf-8")) > 180:
        safe = safe[:60] + "-" + hashlib.sha1(rel.encode()).hexdigest()[:10]
    return safe


class Crawler:
    def __init__(self, root: str, link_re: str, path_prefix: str, cookies: dict | None = None):
        self.root = root
        self.link_re = re.compile(link_re)
        self.path_prefix = path_prefix
        self.sess = requests.Session()
        self.sess.headers["User-Agent"] = UA
        if cookies:
            self.sess.cookies.update(cookies)
        self.seen: set[str] = set()
        self.failed: list[tuple[str, str]] = []

    def normalise(self, href: str) -> str | None:
        if not href:
            return None
        href = href.split("#")[0].split("?")[0]
        absolute = urllib.parse.urljoin(self.root, href)
        parts = urllib.parse.urlparse(absolute)
        if parts.netloc != "sites.google.com":
            return None
        if not self.link_re.match(parts.path):
            return None
        return urllib.parse.urlunparse(parts._replace(query="", fragment=""))

    def discover(self, html: str) -> set[str]:
        """找出頁面上的站內連結。

        除了一般的 href，還要看 Google Sites 「嵌入程式碼」區塊：那些內容以
        HTML entity 形式塞在 data-code 屬性裡（href=&quot;…&quot;），
        只掃原始 HTML 會整批漏掉（職業總覽底下的 42 頁就是這樣漏的）。
        """
        out = set()
        for source in (html, htmlmod.unescape(html)):
            for href in re.findall(r'href="([^"]+)"', source):
                norm = self.normalise(href)
                if norm:
                    out.add(norm)
        return out

    def run(self, limit: int | None = None, delay: float = 0.25) -> dict:
        RAW.mkdir(parents=True, exist_ok=True)
        queue = [self.root]
        index: dict[str, dict] = {}
        while queue:
            url = queue.pop(0)
            if url in self.seen:
                continue
            self.seen.add(url)
            if limit and len(index) >= limit:
                break
            try:
                resp = self.sess.get(url, timeout=45, allow_redirects=True)
            except Exception as exc:  # noqa: BLE001
                self.failed.append((url, repr(exc)))
                continue

            final = resp.url
            if "accounts.google.com" in final:
                self.failed.append((url, "REDIRECTED_TO_LOGIN"))
                print(f"  !! 需要登入: {url}", file=sys.stderr)
                continue
            if resp.status_code != 200:
                self.failed.append((url, f"HTTP {resp.status_code}"))
                continue

            html = resp.text
            slug = slug_for(url, self.path_prefix)
            (RAW / f"{slug}.html").write_text(html, encoding="utf-8")
            title_m = re.search(r"<title>(.*?)</title>", html, re.S)
            index[url] = {
                "url": url,
                "slug": slug,
                "title": (title_m.group(1).strip() if title_m else ""),
                "bytes": len(html),
            }
            print(f"[{len(index):3d}] {index[url]['title'][:28]:<30} {slug[:70]}")

            for link in sorted(self.discover(html)):
                if link not in self.seen:
                    queue.append(link)
            time.sleep(delay)
        return index


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["public", "private"], required=True)
    ap.add_argument("--root")
    ap.add_argument("--site-id")
    ap.add_argument("--cookies", help="JSON 檔，Playwright 匯出的 cookies")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--delay", type=float, default=0.25)
    args = ap.parse_args()

    cookies = None
    if args.cookies:
        raw = json.loads(Path(args.cookies).read_text(encoding="utf-8"))
        items = raw["cookies"] if isinstance(raw, dict) and "cookies" in raw else raw
        cookies = {c["name"]: c["value"] for c in items}
        print(f"載入 {len(cookies)} 個 cookie")

    if args.mode == "public":
        root = args.root.rstrip("/") + "/"
        name = urllib.parse.urlparse(root).path.strip("/").split("/")[-1]
        crawler = Crawler(root, rf"^/view/{re.escape(name)}(/|$)", f"/view/{name}/", cookies)
    else:
        sid = args.site_id
        root = f"https://sites.google.com/d/{sid}/preview"
        crawler = Crawler(root, rf"^/d/{re.escape(sid)}/", f"/d/{sid}/", cookies)

    print(f"起點: {crawler.root}\n")
    index = crawler.run(limit=args.limit, delay=args.delay)

    out = ROOT / ".cache" / "index.json"
    out.write_text(json.dumps(list(index.values()), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n完成 {len(index)} 頁 → {out}")
    if crawler.failed:
        print(f"失敗 {len(crawler.failed)} 筆:")
        for url, why in crawler.failed[:15]:
            print(f"  {why}  {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
