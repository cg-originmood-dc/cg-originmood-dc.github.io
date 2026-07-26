# -*- coding: utf-8 -*-
"""把 .cache/raw 的 Google Sites HTML 轉成結構化內容。

產出：
  content/pages/**.md   散文頁（frontmatter + Markdown）
  content/data/*.csv    資料頁的表格（編輯者可用 Excel / Google Sheets 開）
  .cache/images.json    所有外連圖片 → 本地路徑的對照表

設計原則：資料層不含樣式。原站的顏色轉成 hl-* class，實際顏色由 Astro 的 CSS 決定。
"""
from __future__ import annotations

import csv
import html as htmlmod
import json
import re
import sys
import unicodedata
import urllib.parse
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / ".cache" / "raw"
PAGES = ROOT / "content" / "pages"
DATA = ROOT / "content" / "data"

# 原站顏色 → 語意 class。實際顏色在 src/styles 決定。
COLOR_CLASS = {
    "#ff0000": "hl-key",      # 重點、關鍵字
    "#9900ff": "hl-drop",     # 掉落道具 / 機率
    "#7f6000": "hl-npc",      # NPC / 怪物名
    "#783f04": "hl-mob",      # 怪物名
    "#0000ff": "hl-ref",      # 交互參照
    "#38761d": "hl-ok",
}
BOILERPLATE = {
    "Skip to main content", "Skip to navigation", "Google Sites",
    "Report abuse", "Page details", "Page updated",
}


def prepare_soup(html: str) -> BeautifulSoup:
    """去掉頁首/導覽/頁尾，只留內容區塊。抓圖時也用同一支，確保走訪順序一致。"""
    soup = BeautifulSoup(html, "lxml")
    for t in soup(["script", "style", "noscript"]):
        t.decompose()
    for sel in ("[role=banner]", "[role=navigation]", "[role=contentinfo]", "header", "footer", "nav"):
        for t in soup.select(sel):
            t.decompose()
    return soup


def slugify_filename(name: str) -> str:
    name = unicodedata.normalize("NFKC", name).strip()
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    return name or "untitled"


def page_path_from_url(url: str) -> list[str]:
    path = urllib.parse.urlparse(url).path
    m = re.match(r"^/view/[^/]+/?(.*)$", path)
    rel = urllib.parse.unquote(m.group(1) if m else path).strip("/")
    return [slugify_filename(p) for p in rel.split("/") if p] or ["index"]


# ---------------------------------------------------------------- inline text

def style_of(tag: Tag) -> tuple[bool, str | None]:
    """回傳 (是否粗體, 語意 class)。"""
    st = (tag.get("style") or "").lower()
    bold = False
    m = re.search(r"font-weight:\s*(\d+)", st)
    if m and int(m.group(1)) >= 600:
        bold = True
    if tag.name in ("b", "strong"):
        bold = True
    cls = None
    m = re.search(r"(?<!-)color:\s*(#[0-9a-f]{6})", st)
    if m:
        cls = COLOR_CLASS.get(m.group(1))
    return bold, cls


def esc_md(text: str) -> str:
    return re.sub(r"([\\`*_\[\]])", r"\\\1", text)


SITE_PREFIX = "/view/goodluck2cg"

# 原站本身就寫錯、在原站也是 404 的連結。key/value 都是改寫後的站內路徑。
# 刻意列在這裡而不是直接改內容檔：改了要看得見，日後原站修好也好比對。
LINK_FIXES = {
    # 冰與火的抉擇 → 路徑層級與「奧德/奧斯」都打錯了
    "/專屬任務/傳說之劍任務/奧德希爾德的召喚":
        "/任務攻略/主線任務/傳說之劍系列/奧斯希爾德的召喚",
}


def unwrap_link(href: str) -> str:
    """還原 Google Sites 的連結，並把站內連結改寫成本站路徑。

    - 外部連結被包成 google.com/url?q=<真網址>
    - 站內連結是 /view/goodluck2cg/<中文路徑>，要對到本站的 /<中文路徑>
    路徑一律以 / 開頭（不含部署用的 base），base 由 build 階段套上。
    """
    if not href:
        return href
    parts = urllib.parse.urlparse(href)

    if parts.netloc.endswith("google.com") and parts.path == "/url":
        target = urllib.parse.parse_qs(parts.query).get("q", [""])[0]
        if target:
            return unwrap_link(target)

    is_site = parts.path.startswith(SITE_PREFIX) and (
        not parts.netloc or parts.netloc == "sites.google.com")
    if is_site:
        rel = urllib.parse.unquote(parts.path[len(SITE_PREFIX):]).strip("/")
        if not rel or rel == "首頁":
            return "/"
        path = "/" + "/".join(slugify_filename(s) for s in rel.split("/"))
        return LINK_FIXES.get(path, path)
    return href


def tidy(md: str) -> str:
    """收掉轉換過程留下的接縫。"""
    # 先合併相鄰同色 span，內容層才不會被一堆碎片塞滿
    for _ in range(8):
        new = re.sub(r'<span class="(hl-[a-z]+)">(.*?)</span><span class="\1">', r'<span class="\1">\2', md)
        if new == md:
            break
        md = new
    # 相鄰的粗體片段接起來，避免 </strong><strong> 這種無意義的碎片
    md = md.replace("</strong><strong>", "")
    return re.sub(r"[ \t]+\n", "\n", md)


def inline(node, imgs: list[str]) -> str:
    """把 inline 節點轉成 Markdown 片段。"""
    if isinstance(node, NavigableString):
        return esc_md(str(node))
    if not isinstance(node, Tag):
        return ""

    if node.name == "br":
        return "\n"
    if node.name == "img":
        src = node.get("src") or node.get("data-src") or ""
        if src:
            imgs.append(src)
        alt = (node.get("alt") or "").strip()
        return f"![{esc_md(alt)}]({src})"

    inner = "".join(inline(c, imgs) for c in node.children)

    if node.name == "a":
        href = unwrap_link(node.get("href", ""))
        text = inner.strip()
        if not text:
            # Google Sites 在每個標題前面放一個沒有文字的 <a href="#h.xxxx"> 當錨點。
            # 拿 href 當顯示文字的話，標題會變成「## [#h.n45onte2zti4](…) 禁地追蹤」。
            if href.startswith("#") or not href:
                return ""
            text = href
        return f"[{text}]({href})" if href else text
    if node.name in ("script", "style"):
        return ""

    bold, cls = style_of(node)
    if inner.strip():
        # 粗體用 <strong> 而不是 **。CommonMark 的 flanking 規則對中文很不友善：
        # 「**活動時間：**2023年」這種「粗體收在標點、後面接文字」的寫法，
        # 閉合的 ** 不算 right-flanking，會原樣印出星號。中文內容裡滿地都是，
        # 與其逐案閃避，不如直接輸出標籤 —— 內容層本來就有 span，並不會更難讀。
        if bold:
            lead = len(inner) - len(inner.lstrip())
            trail = len(inner) - len(inner.rstrip())
            inner = f"{inner[:lead]}<strong>{inner[lead:len(inner) - trail]}</strong>{inner[len(inner) - trail:]}"
        if cls:
            inner = f'<span class="{cls}">{inner}</span>'
    return inner


def table_to_md(t: Tag, imgs: list[str]) -> str:
    rows = []
    for tr in t.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if not cells:
            continue
        rows.append(["".join(inline(c, imgs) for c in cell.children).replace("\n", " ").strip()
                     for cell in cells])
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |",
           "| " + " | ".join(["---"] * width) + " |"]
    out += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(out)


CAROUSEL_BG = re.compile(r"background-image:\s*url\(\s*['\"]?([^'\")]+)")


def carousel_to_md(block: Tag, imgs: list[str]) -> str:
    """輪播元件的圖片放在 CSS background-image 裡，不是 <img>，只掃標籤會整組漏掉。

    輪播在靜態站沒有意義，這裡攤平成依序排列的圖片。
    """
    urls = []
    for slide in block.select("div.nQBJnb[style]"):
        m = CAROUSEL_BG.search(slide.get("style", ""))
        if m:
            url = htmlmod.unescape(m.group(1)).strip()
            if url not in urls:
                urls.append(url)
    if not urls:
        return ""
    imgs.extend(urls)
    # 包一層 div 讓介面層知道這是一組輪播圖，而不是七張各自獨立的大圖。
    # 前後留空行，Markdown 才會繼續處理裡面的圖片語法。
    body = "\n\n".join(f"![]({u})" for u in urls)
    return f'<div class="carousel">\n\n{body}\n\n</div>'


def block_to_md(block: Tag, imgs: list[str]) -> str:
    parts: list[str] = []
    seen_links: set[int] = set()
    inline_hosts = ["p", "li", "h1", "h2", "h3", "h4", "h5", "h6"]

    carousel = carousel_to_md(block, imgs)
    if carousel:
        parts.append(carousel)

    def emit_link(a: Tag) -> None:
        """把一個 <a> 轉成 Markdown。文字連結、圖片連結、Sites 按鈕都走這裡。"""
        seen_links.add(id(a))
        href = unwrap_link(a.get("href", ""))
        label = a.get_text(" ", strip=True)
        if label:
            # Sites 的按鈕元件（a.FKF6mc）在原站是實心色塊，不是一般的行內連結。
            # 語意上就是按鈕，所以帶著 class 輸出，實際長相交給 global.css。
            if href and "FKF6mc" in (a.get("class") or []):
                parts.append(
                    f'<a class="sitebtn" href="{htmlmod.escape(href, quote=True)}">'
                    f'{htmlmod.escape(label)}</a>')
                return
            parts.append(f"[{esc_md(label)}]({href})" if href else esc_md(label))
            return
        # 沒有文字就是圖片連結（例如流程圖），圖本身才是內容
        body = "".join(inline(im, imgs) for im in a.find_all("img"))
        if body:
            parts.append(f"[{body}]({href})" if href else body)

    tags = ["p", "table", "ul", "ol", "img", "a", "h1", "h2", "h3", "h4", "h5", "h6"]
    for el in block.find_all(tags, recursive=True):
        if el.find_parent("table") is not None and el.name != "table":
            continue

        # 裸的 <a>（沒有被段落或標題包住）自己成一塊，否則整段連結會被丟掉。
        if el.name == "a":
            if id(el) in seen_links or el.find_parent(inline_hosts) is not None:
                continue
            emit_link(el)
            continue

        # Google Sites 的「按鈕」是 <a> 包住 <p>，走 <p> 的子節點看不到 href，
        # 要往上找出那個 <a>，並且只輸出一次。
        anchor = el.find_parent("a")
        if anchor is not None and block in anchor.parents:
            if id(anchor) not in seen_links:
                emit_link(anchor)
            continue

        if el.name == "table":
            md = table_to_md(el, imgs)
        elif el.name in ("ul", "ol"):
            items = []
            for i, li in enumerate(el.find_all("li", recursive=False), 1):
                mark = f"{i}." if el.name == "ol" else "-"
                items.append(f"{mark} " + "".join(inline(c, imgs) for c in li.children).strip())
            md = "\n".join(items)
        elif re.fullmatch(r"h[1-6]", el.name):
            md = "#" * int(el.name[1]) + " " + "".join(inline(c, imgs) for c in el.children).strip()
        elif el.name == "img":
            if el.find_parent(["p", "table", "li"]):
                continue
            md = inline(el, imgs)
        else:
            md = "".join(inline(c, imgs) for c in el.children)
        md = tidy(md).strip()
        if md and md not in BOILERPLATE:
            parts.append(md)
    return "\n\n".join(parts)


# ---------------------------------------------------------------- data tables

def parse_embed_tables(soup: BeautifulSoup) -> list[tuple[list[str], list[list[str]], list[str]]]:
    """回傳 [(header, rows, image_urls)]，每個 cell 的圖片抽成獨立欄位。

    嵌入區塊是站長手寫的 HTML，常有沒關閉的 <td>/<div>。lxml 會把後續整段吞成
    同一列（曾出現 1530 欄的假列），html5lib 依 HTML5 規則自動關閉，跟瀏覽器一致。
    """
    out = []
    for holder in soup.select("div[data-code]"):
        code = htmlmod.unescape(holder["data-code"])
        inner = BeautifulSoup(code, "html5lib")
        for t in inner.find_all("table"):
            # 只取直屬本表格的列與儲存格，避免巢狀表格互相汙染
            trs = [tr for tr in t.find_all("tr") if tr.find_parent("table") is t]
            if len(trs) < 2:
                continue
            grid, imgs = [], []
            for tr in trs:
                cells = [c for c in tr.find_all(["td", "th"]) if c.find_parent("table") is t]
                if not cells:
                    continue
                row, row_img = [], ""
                for c in cells:
                    im = c.find("img")
                    if im and im.get("src"):
                        row_img = im["src"]
                    row.append(re.sub(r"\s+", " ", c.get_text(" ", strip=True)))
                grid.append(row)
                imgs.append(row_img)
            if len(grid) < 2:
                continue
            header = grid[0]
            body, body_imgs = grid[1:], imgs[1:]
            width = max(len(r) for r in grid)
            header = (header + [""] * (width - len(header)))[:width]
            body = [(r + [""] * (width - len(r)))[:width] for r in body]

            # 丟掉「標題空白且整欄無值」的欄位（colspan / 多餘 <td> 造成）
            keep = [i for i in range(width)
                    if header[i].strip() or any(r[i].strip() for r in body)]
            if len(keep) < width:
                header = [header[i] for i in keep]
                body = [[r[i] for i in keep] for r in body]

            out.append((header, body, body_imgs))
    return out


def cell(value) -> str:
    """資料格正規化：原始 JSON 裡有換行當版面用（'補血\\n魔法'），壓成單行。"""
    return re.sub(r"\s+", " ", str(value)).strip()


def js_array_at(text: str, start: int) -> str | None:
    """從 text[start] 的 '[' 開始做括號配對，回傳完整的陣列字面值。

    不能用正規表示式抓：`window.data = [...];` 後面往往還有渲染用的 JS，
    「一路吃到 </script>」會吃過頭（御法劍仙），「吃到第一個 ]」又會吃不夠。
    掃描時要跳過字串內容，否則資料裡的 ] 會提早收尾。
    """
    depth = 0
    i, n = start, len(text)
    while i < n:
        ch = text[i]
        if ch in "\"'":
            quote, i = ch, i + 1
            while i < n and text[i] != quote:
                i += 2 if text[i] == "\\" else 1
        elif ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
        i += 1
    return None


def js_to_json(literal: str) -> str:
    """把 JS 陣列字面值整理成合法 JSON。

    站長是直接手寫 JS，有兩種 JSON 不接受的寫法：
      尾逗號  [1, 2, ]
      稀疏陣列的空洞  [[…], […], , , ,]  ← 傳教士頁，等同一批空白列，直接拿掉
    """
    prev, s = None, literal
    while prev != s:
        prev = s
        s = re.sub(r",(\s*),", ",", s)        # 中間的空洞
        s = re.sub(r"\[(\s*),", "[", s)       # 開頭的空洞
        s = re.sub(r",(\s*[\]}])", r"\1", s)  # 尾逗號（也吃掉結尾的空洞）
    return s


def parse_embed_json(soup: BeautifulSoup) -> list[tuple[str, list[str], list[list[str]]]]:
    """解析靠 JavaScript 渲染的資料表。

    職業頁（劍士、巫師…共 42 頁）的內容不是 HTML 表格，而是
    `<script>window.data = [...]</script>`，由前端在瀏覽器裡畫成表格。
    離線抓下來的 HTML 因此是空的，得直接把那包 JSON 讀出來。

    結構： [{ name: 區塊名, items: [{ name: 首欄標題, desc: [其餘欄位標題], items: [列…] }] }]
    回傳 [(資料集名稱, header, rows)]
    """
    out: list[tuple[str, list[str], list[list[str]]]] = []
    seen_payloads: set[str] = set()
    for holder in soup.select("div[data-code]"):
        code = htmlmod.unescape(holder["data-code"])
        data = None
        for m in re.finditer(r"window\.data\s*=\s*(?=\[)", code):
            literal = js_array_at(code, m.end())
            if not literal:
                continue
            raw = js_to_json(literal)
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as exc:
                print(f"    !! window.data 解析失敗：{exc}", file=sys.stderr)
                continue
            break
        if data is None:
            continue
        # 同一頁重複嵌入同一份資料時只取一次
        fingerprint = json.dumps(data, ensure_ascii=False, sort_keys=True)
        if fingerprint in seen_payloads:
            continue
        seen_payloads.add(fingerprint)

        for section in data if isinstance(data, list) else []:
            if not isinstance(section, dict):
                continue
            sec_name = str(section.get("name") or "").strip()

            # 同一區塊裡標題完全相同的子表，是原站為了版面把一份清單切成並排的好幾欄
            # （例如「巫師魔法上限」被切成 4 個各 16 列的表），語意上是同一張，合併回來。
            merged: dict[tuple, tuple[str, list[str], list[list[str]]]] = {}
            order: list[tuple] = []
            for sub in (section.get("items") or []):
                if not isinstance(sub, dict):
                    continue
                rows = [[cell(c) for c in r] for r in (sub.get("items") or []) if isinstance(r, list)]
                if not rows:
                    continue
                first_col = cell(sub.get("name") or "")
                desc = sub.get("desc")
                header = [first_col] + ([cell(d) for d in desc] if isinstance(desc, list) else [])
                key = tuple(header)
                if key not in merged:
                    merged[key] = (first_col, header, [])
                    order.append(key)
                merged[key][2].extend(rows)

            for key in order:
                first_col, header, rows = merged[key]
                width = max([len(header)] + [len(r) for r in rows])
                header = (header + [""] * width)[:width]
                rows = [(r + [""] * width)[:width] for r in rows]
                label = sec_name or first_col
                if len(order) > 1 and first_col:
                    label = f"{sec_name}-{first_col}" if sec_name else first_col
                out.append((label or "資料", header, rows))
    return out


def link_cards(root: Tag) -> str:
    """把「標題 + 一整組連結」的區塊轉成語意化的卡片。

    職業總覽就是這種版面：每個系別一張卡，底下是一排職業連結。
    直接丟給 block_to_md 會攤成一長串各自成段的連結，跟原站差很多。
    只認結構不認 class 名稱，其他頁面長成這樣也適用。
    """
    cards = []
    for group in root.find_all(["div", "section"], recursive=True):
        head = group.find(["h1", "h2", "h3", "h4"], recursive=False)
        if not head:
            continue
        links = [a for a in group.find_all("a") if a.get("href") and a.get_text(strip=True)]
        # 要成組才算卡片；只有一兩條連結的區塊當成一般內文比較準
        if len(links) < 3:
            continue
        chips = "".join(
            f'<a href="{htmlmod.escape(unwrap_link(a["href"]), quote=True)}">'
            f'{htmlmod.escape(a.get_text(" ", strip=True))}</a>'
            for a in links)
        cards.append(
            f'<section class="linkcard"><h3>{htmlmod.escape(head.get_text(" ", strip=True))}</h3>'
            f'<div class="linkcard__items">{chips}</div></section>')
    return f'<div class="linkcards">{"".join(cards)}</div>' if cards else ""


def embed_prose(soup: BeautifulSoup, imgs: list[str]) -> str:
    """處理「不是表格」的嵌入區塊。

    有些頁面（例如職業總覽）的嵌入是站長手寫的版面，內容是一堆連結而不是表格。
    這種區塊如果只跑表格解析就會整頁變空，所以這裡把它當一般內容轉成 Markdown。
    """
    parts = []
    for holder in soup.select("div[data-code]"):
        code = htmlmod.unescape(holder["data-code"])
        inner = BeautifulSoup(code, "html5lib")
        if re.search(r"window\.data\s*=\s*\[", code):
            continue  # 由 parse_embed_json 轉成 CSV
        for t in inner(["style", "script"]):
            t.decompose()
        if inner.find("table"):
            continue  # 表格走 CSV，不重複輸出
        body = inner.body or inner
        md = link_cards(body) or block_to_md(body, imgs)
        if md.strip():
            parts.append(md)
    return "\n\n".join(parts)


def dataset_name(title: str, used: set[str]) -> str:
    base = slugify_filename(title).replace(" ", "-").replace("/", "-") or "data"
    name, i = base, 2
    while name in used:
        name, i = f"{base}-{i}", i + 1
    used.add(name)
    return name


def extract_nav_order(html: str) -> list[str]:
    """讀出原站左側導覽的項目順序。

    原站的排序是人工排的（首頁 → 專屬寵物 → 任務攻略 …），照字典序長出來會完全不一樣。
    這裡只取「順序」，實際的階層仍然由頁面路徑決定。
    要用原始 HTML，不能用 prepare_soup 的結果——那支會把導覽整個拆掉。
    """
    soup = BeautifulSoup(html, "lxml")
    nav = soup.find(attrs={"role": "navigation"}) or soup.find("nav")
    if not nav:
        return []
    labels: list[str] = []
    for a in nav.find_all("a"):
        text = a.get_text(" ", strip=True)
        if text and text not in labels:
            labels.append(text)
    return labels


# ---------------------------------------------------------------- main

def main() -> int:
    index = json.loads((ROOT / ".cache" / "index.json").read_text(encoding="utf-8"))
    PAGES.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)

    all_images: set[str] = set()
    used_names: set[str] = set()
    manifest = []
    nav_order: list[str] = []

    for entry in sorted(index, key=lambda e: e["url"]):
        raw = RAW / f"{entry['slug']}.html"
        if not raw.exists():
            continue
        html_text = raw.read_text(encoding="utf-8")
        if not nav_order:
            nav_order = extract_nav_order(html_text)
        soup = prepare_soup(html_text)
        segments = page_path_from_url(entry["url"])
        title = entry["title"] or segments[-1]
        imgs: list[str] = []

        # 資料表 → CSV
        datasets = []
        for header, rows, row_imgs in parse_embed_tables(soup):
            if len(rows) < 2:
                continue
            name = dataset_name(title, used_names)
            has_img = any(row_imgs)
            cols = list(header) + (["image"] if has_img else [])
            with (DATA / f"{name}.csv").open("w", encoding="utf-8-sig", newline="") as fh:
                w = csv.writer(fh)
                w.writerow(cols)
                for r, im in zip(rows, row_imgs):
                    w.writerow(list(r) + ([im] if has_img else []))
            all_images.update(u for u in row_imgs if u)
            datasets.append({"name": name, "rows": len(rows), "columns": cols})

        # 前端渲染的資料表（職業頁）→ CSV
        for label, header, rows in parse_embed_json(soup):
            name = dataset_name(label, used_names)
            with (DATA / f"{name}.csv").open("w", encoding="utf-8-sig", newline="") as fh:
                w = csv.writer(fh)
                w.writerow(header)
                w.writerows(rows)
            datasets.append({"name": name, "rows": len(rows), "columns": header})

        body_md = "\n\n".join(
            md for md in (block_to_md(b, imgs) for b in soup.select("div.oKdM2c")) if md
        )
        extra = embed_prose(soup, imgs)
        if extra:
            body_md = f"{body_md}\n\n{extra}".strip()
        all_images.update(imgs)

        # 爬到的網址有些片段是 percent-encoded、有些不是，統一解碼比較好讀
        src = urllib.parse.urlparse(entry["url"])
        fm = {
            "title": title,
            "sourceUrl": urllib.parse.urlunparse(
                src._replace(path=urllib.parse.unquote(src.path))),
            "breadcrumb": segments[:-1],
        }
        if datasets:
            fm["datasets"] = [d["name"] for d in datasets]

        lines = ["---"]
        for k, v in fm.items():
            if isinstance(v, list):
                lines.append(f"{k}:" + (" []" if not v else ""))
                lines.extend(f"  - {json.dumps(x, ensure_ascii=False)}" for x in v)
            else:
                lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
        lines.append("---")
        lines.append("")
        lines.append(body_md)

        dest = PAGES.joinpath(*segments).with_suffix(".md")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

        manifest.append({
            "title": title, "path": "/".join(segments), "sourceUrl": entry["url"],
            "datasets": [d["name"] for d in datasets], "prose_chars": len(body_md),
            "images": len(set(imgs)),
        })

    (ROOT / ".cache" / "images.json").write_text(
        json.dumps(sorted(all_images), ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / ".cache" / "pages.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "content" / "nav-order.json").write_text(
        json.dumps(nav_order, ensure_ascii=False, indent=1), encoding="utf-8")

    prose = sum(1 for m in manifest if m["prose_chars"] > 0)
    ds = sum(len(m["datasets"]) for m in manifest)
    print(f"頁面 {len(manifest)}（有內文 {prose}）| 資料集 {ds} 個 CSV | 圖片 {len(all_images)} 張唯一網址")
    print(f"導覽順序 {len(nav_order)} 項 → content/nav-order.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
