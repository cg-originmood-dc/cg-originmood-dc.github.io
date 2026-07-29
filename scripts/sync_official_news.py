# -*- coding: utf-8 -*-
"""同步初心官網公告，建立大事記並補齊專屬寵物公告來源。

產物：
  content/data/官方大事記.csv
  content/data/官方公告索引.csv
  content/data/專屬寵物.csv（補上公告日、公告連結）

下載的 HTML 只快取在 .cache/official-news，不納入網站內容。

用法：
  python scripts/sync_official_news.py
  python scripts/sync_official_news.py --refresh
"""
from __future__ import annotations

import argparse
import csv
import difflib
import html
import json
import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "official-news"
ARTICLE_CACHE = CACHE / "articles"
DATA = ROOT / "content" / "data"
PET_CSV = DATA / "專屬寵物.csv"
INDEX_URL = "https://cg.originmood.com/news.html?id=1"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
)

FIELDS = ("體力", "力量", "防禦", "速度", "魔法", "種族", "技格", "總檔", "屬性", "技能")
STAT_LABELS = {"體力", "力量", "防禦", "速度", "魔法"}
META_LABELS = {"種族": "種族", "技能格": "技格", "能力總檔": "總檔", "屬性": "屬性"}
DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})\s*$")
SPACE_RE = re.compile(r"\s+")
LV_RE = re.compile(r"(?i)\blv\.?\s*(\d+)")
LOCAL = threading.local()


@dataclass
class NewsRef:
    date: str
    title: str
    url: str


@dataclass
class PetRecord:
    name: str
    date: str
    title: str
    url: str
    體力: str = ""
    力量: str = ""
    防禦: str = ""
    速度: str = ""
    魔法: str = ""
    種族: str = ""
    技格: str = ""
    總檔: str = ""
    屬性: str = ""
    技能: str = ""


@dataclass
class Article:
    date: str
    title: str
    url: str
    text: str
    pets: list[PetRecord]


def clean(value: str) -> str:
    return SPACE_RE.sub(" ", html.unescape(value or "")).strip()


def session() -> requests.Session:
    if getattr(LOCAL, "session", None) is None:
        s = requests.Session()
        retry = Retry(
            total=4,
            backoff_factor=0.5,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=("GET",),
        )
        s.mount("https://", HTTPAdapter(max_retries=retry))
        s.headers.update({"User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9"})
        LOCAL.session = s
    return LOCAL.session


def fetch(url: str, cache_file: Path, refresh: bool = False) -> str:
    if cache_file.exists() and not refresh:
        return cache_file.read_text(encoding="utf-8")
    response = session().get(url, timeout=45)
    response.raise_for_status()
    response.encoding = response.apparent_encoding or "utf-8"
    text = response.text
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(text, encoding="utf-8")
    return text


def parse_index(refresh: bool = False) -> list[NewsRef]:
    source = fetch(INDEX_URL, CACHE / "index.html", refresh)
    soup = BeautifulSoup(source, "html.parser")
    refs: list[NewsRef] = []
    seen: set[str] = set()
    for anchor in soup.select('a[href*="/NewsContent/zh_TW/"]'):
        url = urljoin(INDEX_URL, anchor.get("href", ""))
        if not url or url in seen:
            continue
        label = clean(anchor.get_text(" ", strip=True))
        match = DATE_RE.search(label)
        if not match:
            continue
        seen.add(url)
        refs.append(NewsRef(match.group(1), label[: match.start()].strip(), url))
    return refs


def cells_of(row) -> list[str]:
    return [clean(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"], recursive=False)]


def value_after(cells: list[str], label: str) -> str:
    for index, value in enumerate(cells):
        if value == label and index + 1 < len(cells):
            return cells[index + 1]
    return ""


def strip_default_skills(value: str) -> str:
    value = clean(value)
    value = re.sub(r"^(?:攻擊|攻击)\s*[、,，]\s*(?:防禦|防御)\s*[、,，]?\s*", "", value)
    return value if value not in {"攻擊、防禦", "攻击、防御", "攻擊", "防禦"} else ""


def parse_pet_table(table, ref: NewsRef) -> list[PetRecord]:
    rows = [cells_of(row) for row in table.find_all("tr")]
    rows = [row for row in rows if any(row)]
    pets: list[PetRecord] = []
    cursor = 0
    while cursor < len(rows):
        header = rows[cursor]
        if "寵物名稱" not in header or "能力總檔" not in header:
            cursor += 1
            continue

        data_index = cursor + 1
        while data_index < len(rows) and not any(rows[data_index]):
            data_index += 1
        if data_index >= len(rows):
            break
        first = rows[data_index]
        name = next((v for v in first if v), "")
        if not name or name in {"寵物名稱", "名稱"}:
            cursor += 1
            continue

        record = PetRecord(name=name, date=ref.date, title=ref.title, url=ref.url)
        total_index = header.index("能力總檔")
        attr_index = header.index("屬性")
        if total_index < len(first):
            record.總檔 = first[total_index]
        if attr_index < len(first):
            record.屬性 = first[attr_index]

        skill_col: int | None = None
        end = data_index + 1
        while end < len(rows):
            current = rows[end]
            if "寵物名稱" in current and "能力總檔" in current:
                break
            for label in STAT_LABELS:
                value = value_after(current, label)
                if value:
                    setattr(record, label, value)
            for source_label, target in META_LABELS.items():
                value = value_after(current, source_label)
                if value:
                    setattr(record, target, value)
            if "初始技能" in current:
                skill_col = current.index("初始技能") + 1
                if skill_col < len(current):
                    record.技能 = strip_default_skills(current[skill_col])
            elif skill_col is not None and skill_col < len(current):
                candidate = strip_default_skills(current[skill_col])
                if candidate and candidate not in STAT_LABELS and not candidate.isdigit():
                    record.技能 = "、".join(v for v in (record.技能, candidate) if v)
            end += 1

        numeric_count = sum(bool(getattr(record, label)) for label in STAT_LABELS)
        # 排除只有「寵物名稱」欄名、但實際內容是抽獎品項清單的表格。
        if numeric_count >= 3 and (record.總檔 or record.種族):
            pets.append(record)
        cursor = max(end, cursor + 1)
    return pets


def article_cache_name(ref: NewsRef) -> Path:
    stem = re.sub(r"[^A-Za-z0-9_.-]", "_", ref.url.rsplit("/", 1)[-1])
    return ARTICLE_CACHE / stem


def parse_article(ref: NewsRef, refresh: bool = False) -> Article:
    source = fetch(ref.url, article_cache_name(ref), refresh)
    soup = BeautifulSoup(source, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = clean(soup.get_text(" ", strip=True))
    pets: list[PetRecord] = []
    for table in soup.find_all("table"):
        pets.extend(parse_pet_table(table, ref))
    # 同一篇公告偶爾因巢狀 table 被 BeautifulSoup 讀到兩次，這裡去重。
    unique: dict[tuple, PetRecord] = {}
    for pet in pets:
        key = tuple(getattr(pet, field) for field in ("name", *FIELDS))
        unique[key] = pet
    return Article(ref.date, ref.title, ref.url, text, list(unique.values()))


def load_articles(refs: list[NewsRef], refresh: bool, workers: int) -> list[Article]:
    articles: list[Article] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(parse_article, ref, refresh): ref for ref in refs}
        done = 0
        for future in as_completed(futures):
            ref = futures[future]
            try:
                articles.append(future.result())
            except Exception as exc:  # 保留其他公告，並讓失敗清楚可見
                print(f"！抓取失敗：{ref.date} {ref.title}: {exc}")
            done += 1
            if done % 100 == 0 or done == len(refs):
                print(f"已處理公告 {done}/{len(refs)}")
    return sorted(articles, key=lambda article: (article.date, article.url))


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), list(reader)


def write_csv(path: Path, columns: Iterable[str], rows: Iterable[dict[str, str]]) -> None:
    columns = list(columns)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=columns, extrasaction="ignore", lineterminator="\n"
        )
        writer.writeheader()
        writer.writerows(rows)


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "")
    return re.sub(r"[\s　·・．。,:：，、（）()「」『』【】\[\]_-]+", "", value).lower()


def name_key(value: str) -> str:
    return normalize_text(value)


def display_name(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", clean(value)))


def normalize_number(value: str) -> str:
    match = re.search(r"-?\d+", value or "")
    return match.group(0) if match else normalize_text(value)


def normalize_skill_part(value: str) -> str:
    value = value.strip()
    value = re.sub(r"\([^)]*(?:技能|隨機|随机|說明|说明)[^)]*\)", "", value)
    value = re.sub(r"（[^）]*(?:技能|隨機|随机|說明|说明)[^）]*）", "", value)
    value = re.split(r"[:：]", value, maxsplit=1)[0]
    value = re.split(
        r"\s+(?=(?:將|将|對|对|犧牲|牺牲|隨機|随机|造成|給予|给予|傷害|伤害))",
        value,
        maxsplit=1,
    )[0]
    value = LV_RE.sub(lambda match: f"lv{match.group(1)}", value)
    return normalize_text(value)


def normalize_skills(value: str) -> tuple[str, ...]:
    value = strip_default_skills(value)
    value = re.split(r"[;；]\s*(?:注|說明|说明)\s*[:：]?", value, maxsplit=1)[0]
    # 舊表格常把技能說明直接接在技能名後；說明不是另一個技能。
    value = re.split(r"[:：]", value, maxsplit=1)[0]
    value = re.split(
        r"\s+(?=(?:將|将|對|对|犧牲|牺牲|隨機|随机|造成|給予|给予|傷害|伤害))",
        value,
        maxsplit=1,
    )[0]
    parts = re.split(r"[、,，;；/／\n]+", value)
    return tuple(sorted(filter(None, (normalize_skill_part(part) for part in parts))))


def normalize_attribute(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    pairs = re.findall(r"([地水火風])\s*(\d+)", normalized)
    elements = [element for element, _ in pairs]
    if pairs and len(elements) == len(set(elements)):
        scores = dict(pairs)
        return "".join(f"{element}{scores[element]}" for element in "地水火風" if element in scores)
    return normalize_text(normalized)


def differing_fields(local: dict[str, str], official: PetRecord) -> list[str]:
    differences: list[str] = []
    for field in FIELDS:
        official_value = getattr(official, field)
        if not official_value:
            continue
        local_value = local.get(field, "")
        if field in STAT_LABELS | {"技格", "總檔"}:
            same = normalize_number(local_value) == normalize_number(official_value)
        elif field == "技能":
            same = normalize_skills(local_value) == normalize_skills(official_value)
        elif field == "屬性":
            same = normalize_attribute(local_value) == normalize_attribute(official_value)
        else:
            same = normalize_text(local_value) == normalize_text(official_value)
        if not same:
            differences.append(field)
    return differences


def record_values(record: PetRecord, fields: Iterable[str]) -> str:
    return "；".join(f"{field}={getattr(record, field)}" for field in fields)


def local_values(record: dict[str, str], fields: Iterable[str]) -> str:
    return "；".join(f"{field}={record.get(field, '')}" for field in fields)


def markdown_link(label: str, url: str) -> str:
    return f"[{label}]({url})" if url else ""


def mention_context(name: str, article: Article) -> bool:
    compact_name = normalize_text(name)
    compact_text = normalize_text(article.text)
    compact_title = normalize_text(article.title)
    if not compact_name or compact_name not in compact_text:
        return False
    if len(compact_name) >= 2 and compact_name in compact_title:
        return True
    escaped = re.escape(name)
    contexts = (
        rf"{escaped}\s*(?:召喚書|设计图|設計圖|寵物|宠物|精華|圖鑑|圖鑒|禮盒|Lv\.?\s*1|LV\.?\s*1)",
        rf"(?:寵物|宠物|獲得|获得|推出|全新)\s*.{{0,8}}{escaped}",
    )
    if any(re.search(pattern, article.text, re.I) for pattern in contexts):
        return True
    # 三字以上的專名誤撞率低；仍要求公告附近提到寵物型內容。
    return len(compact_name) >= 3 and any(
        token in article.text for token in ("寵物名稱", "召喚書", "寵物形象", "獲得寵物")
    )


def category_of(article: Article) -> str:
    title = article.title
    if re.search(r"PVP|爭霸賽|争霸赛|比賽服|冠軍|亞軍", title, re.I):
        return "賽事"
    if re.search(r"新職業|職業|系統|網頁角色銀行|星圖|技能|視窗|跟隨", title):
        return "職業／系統"
    if re.search(r"地圖|村|大陸|海底|天空|迷宮|道場|任務|試煉|塔|聖域|宮|禁地", title):
        return "地圖／任務"
    if re.search(r"週年|新春|春節|元宵|情人節|端午|七夕|中秋|萬聖|聖誕|感恩節|回歸", title):
        return "節慶／活動"
    if article.pets or "寵物" in title:
        return "寵物／秘寶"
    return "活動／營運"


def _opening_name(value: str) -> str:
    value = clean(value)
    value = re.sub(r"^[\s「『【《〈\"']+|[\s」』】》〉\"']+$", "", value)
    value = re.sub(r"[「」『』【】《》〈〉]", "", value)
    value = re.sub(r"^\d+[.、．]\s*", "", value)
    value = re.sub(r"(?:系列)?的$", "", value)
    return value[:60].strip()


def opening_details(article: Article) -> tuple[list[str], list[str]]:
    """找出公告裡明確寫出的職業、地圖與任務開放資訊。

    只採「開放／新增 + 類型 + 冒號 + 名稱」等強訊號，避免把一般活動文案中
    提到的地圖或任務誤標成新內容。預告與正式開放分開標示。
    """
    title = article.title
    body = article.text
    date_at = body.find(article.date)
    if date_at >= 0:
        body = body[date_at + len(article.date) :]

    tags: list[str] = []
    notes: list[str] = []

    def add(tag: str, note: str) -> None:
        if tag not in tags:
            tags.append(tag)
        if note and note not in notes:
            notes.append(note)

    task_pattern = re.compile(
        r"(?:開放|新增)(?:了)?\s*([^：:；;。！!\n]{0,20}?)任務\s*[：:]\s*[「『【《]?"
        r"([^」』】》；;。！!\n]{1,60})"
    )
    for match in task_pattern.finditer(body):
        prefix = body[max(0, match.start() - 6) : match.start()]
        if re.search(r"不|未|延期|延後|取消|關閉|停止", prefix):
            continue
        kind = _opening_name(match.group(1))
        name = _opening_name(match.group(2))
        if not name:
            continue
        tag = "限時任務" if "限時" in kind else "新任務"
        label = f"開放{kind}任務" if kind else "開放任務"
        add(tag, f"{label}：{name}")

    quoted_task_pattern = re.compile(
        r"(?:開放|新增)(?:了)?\s*([^「『【《；;。！!\n]{0,20}?)任務\s*"
        r"[「『【《]([^」』】》]{1,60})[」』】》]"
    )
    for match in quoted_task_pattern.finditer(body):
        prefix = body[max(0, match.start() - 6) : match.start()]
        if re.search(r"不|未|延期|延後|取消|關閉|停止", prefix):
            continue
        kind = _opening_name(match.group(1))
        name = _opening_name(match.group(2))
        if name:
            tag = "限時任務" if "限時" in kind else "新任務"
            label = f"開放{kind}任務" if kind else "開放任務"
            add(tag, f"{label}：{name}")

    patterns = (
        (
            "新地圖",
            "開放地圖",
            re.compile(
                r"(?:開放|新增)(?:了)?(?:[\u3400-\u9fff]{0,12}的)?(?:全新|新的|新)?\s*地圖"
                r"\s*[：:]\s*[「『【《]?([^」』】》；;。！!\n]{1,60})"
            ),
        ),
        (
            "新職業",
            "開放職業",
            re.compile(r"(?:開放|新增)(?:了)?(?:全新|新的|新)?\s*職業\s*[：:]\s*([^；;。！!\n]{1,60})"),
        ),
    )
    for tag, label, pattern in patterns:
        for match in pattern.finditer(body):
            prefix = body[max(0, match.start() - 6) : match.start()]
            if re.search(r"不|未|延期|延後|取消|關閉|停止", prefix):
                continue
            name = _opening_name(match.group(1))
            if name:
                add(tag, f"{label}：{name}")

    for match in re.finditer(
        r"開放\s*([^；;。！!\n]{1,24}?)(?:相關)?地圖與任務", body
    ):
        prefix = body[max(0, match.start() - 6) : match.start()]
        if not re.search(r"不|未|延期|延後|取消|關閉|停止", prefix):
            name = _opening_name(match.group(1))
            if name:
                add("新地圖", f"開放地圖與任務：{name}")

    for match in re.finditer(r"開放活動[「『【《]([^」』】》]{1,40}任務)[」』】》]", body):
        name = _opening_name(match.group(1))
        add("限時任務" if "限時" in name else "新任務", f"開放活動：{name}")

    # 標題本身比行銷內文更穩定，補上幾種官網常用格式。
    match = re.search(r"(?:海底世界)?前置任務[：:]\s*(.+)$", title)
    if match:
        add("新任務", f"開放前置任務：{_opening_name(match.group(1))}")
    match = re.search(r"(?:活動)?限時任務[：:]\s*(.+)$", title)
    if match and "關於" not in title:
        add("限時任務", f"開放限時任務：{_opening_name(match.group(1))}")
    match = re.search(r"開放(.{2,18}?(?:村莊|村|王國|大陸))(?:\s|$)", title)
    if match:
        add("新地圖", f"開放地圖：{_opening_name(match.group(1))}")

    if "新職業登場" in title and "無雙刀客" in title:
        add("新職業", "正式開放刀客與鍛刀工職業，並開放刀客專屬技能「燕斬」")
    if "新職業和地圖即將更新" in title:
        add("內容預告", "預告第四季度推出新職業、全新任務與「天空之城」地圖")
    if title == "亞諾曼王國即將開放":
        add("地圖預告", "預告開放亞諾曼王國；公告另列暫不開放的地圖與任務")
    if title.startswith("開拓新大陸"):
        add("新地圖", f"推出新大陸相關任務：{title.split(' ', 1)[-1]}")
    if "全新地圖荒漠之地" in body:
        add("地圖預告", "首度曝光全新地圖「荒漠之地」")
    match = re.search(r"將於\s*(\d{1,2}月\d{1,2}日)\s*開放更新\s*([^，,；;。]{2,20})", body)
    if match:
        add("地圖預告", f"預告 {match.group(1)} 開放：{_opening_name(match.group(2))}")

    return tags, notes


def is_major(article: Article) -> bool:
    title = article.title
    if article.pets:
        return True
    routine = re.search(
        r"(^|關於).*(?:維護|停機|延遲|異常|修復|補償|概率|機率|登錄|登入|調整|重賽|延賽)"
        r"|^\d{1,2}月\d{1,2}日.*公告|不維護|取消維護|臨時維護",
        title,
    )
    if routine:
        return False
    signals = re.search(
        r"週年|新春|元宵|情人節|端午|七夕|中秋|萬聖|聖誕|感恩節|"
        r"新職業|新地圖|資料片|系統|開放|開啟|登場|降臨|來襲|復生|覺醒|"
        r"任務|試煉|道場|迷宮|星圖|爭霸賽|PVP|寵物|秘寶|返場|活動",
        title,
        re.I,
    )
    return bool(signals)


def closest_name(name: str, local_names: list[str]) -> str:
    matches = difflib.get_close_matches(name, local_names, n=1, cutoff=0.55)
    return matches[0] if matches else ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="忽略 HTML 快取，重新下載")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    refs = parse_index(args.refresh)
    print(f"公告索引：{len(refs)} 篇（{min(r.date for r in refs)}～{max(r.date for r in refs)}）")
    articles = load_articles(refs, args.refresh, max(1, args.workers))
    if len(articles) != len(refs):
        print(f"！有 {len(refs) - len(articles)} 篇公告未成功解析")

    all_pets = [pet for article in articles for pet in article.pets]
    print(f"結構化寵物紀錄：{len(all_pets)} 筆，{len({p.name for p in all_pets})} 個名稱")

    pet_columns, local_rows = read_csv(PET_CSV)
    local_by_name = {row["名稱"].strip(): row for row in local_rows if row.get("名稱", "").strip()}
    local_names = list(local_by_name)
    local_by_key: dict[str, str] = {}
    for name in local_names:
        key = name_key(name)
        if key in local_by_key and local_by_key[key] != name:
            print(f"！清單名稱正規化後重複：{local_by_key[key]} / {name}")
        local_by_key[key] = name

    def grouped_name(official_name: str) -> str:
        return local_by_key.get(name_key(official_name), display_name(official_name))

    structured_by_name: dict[str, list[PetRecord]] = {}
    for pet in all_pets:
        structured_by_name.setdefault(grouped_name(pet.name), []).append(pet)
    for records in structured_by_name.values():
        records.sort(key=lambda record: (record.date, record.url))

    articles_ascending = sorted(articles, key=lambda article: (article.date, article.url))
    first_seen: dict[str, tuple[str, str, str]] = {}
    for name in local_names:
        records = structured_by_name.get(name, [])
        if records:
            first = records[0]
            first_seen[name] = (first.date, first.url, "完整資料")
            continue
        for article in articles_ascending:
            if mention_context(name, article):
                first_seen[name] = (article.date, article.url, "文字提及")
                break

    # 直接回填專屬寵物資料表；欄位放在技能之後，保留原本 image 與任務用途順序。
    for column in ("公告日", "公告連結"):
        if column not in pet_columns:
            position = pet_columns.index("image") if "image" in pet_columns else len(pet_columns)
            pet_columns.insert(position, column)
    for row in local_rows:
        name = row.get("名稱", "").strip()
        seen = first_seen.get(name)
        row["公告日"] = seen[0] if seen else ""
        row["公告連結"] = markdown_link("公告", seen[1]) if seen else ""
    write_csv(PET_CSV, pet_columns, local_rows)

    # 完整公告索引，方便追查未列入「大事記」的維護、修正與機率公告。
    index_rows = []
    for article in sorted(articles, key=lambda item: (item.date, item.url), reverse=True):
        opening_tags, opening_notes = opening_details(article)
        index_rows.append(
            {
                "日期": article.date,
                "類別": category_of(article),
                "重點標記": "、".join(opening_tags),
                "開放內容說明": "；".join(opening_notes),
                "公告": article.title,
                "解析寵物數": str(len(article.pets)),
                "公告連結": markdown_link("查看", article.url),
            }
        )
    write_csv(
        DATA / "官方公告索引.csv",
        ("日期", "類別", "重點標記", "開放內容說明", "公告", "解析寵物數", "公告連結"),
        index_rows,
    )

    # 大事記只保留改版、活動、賽事與寵物內容；日常停機／修正仍保留在完整索引。
    first_structured_url = {
        name: records[0].url for name, records in structured_by_name.items() if records
    }
    timeline_rows = []
    for article in sorted(articles, key=lambda item: (item.date, item.url), reverse=True):
        opening_tags, opening_notes = opening_details(article)
        if not is_major(article) and not opening_tags:
            continue
        debut_names = sorted(
            {
                grouped_name(pet.name)
                for pet in article.pets
                if first_structured_url.get(grouped_name(pet.name)) == article.url
            }
        )
        timeline_rows.append(
            {
                "日期": article.date,
                "類別": (
                    "職業／系統"
                    if any(tag in opening_tags for tag in ("新職業", "職業預告"))
                    else "地圖／任務"
                    if any(tag in opening_tags for tag in ("新地圖", "地圖預告", "新任務", "限時任務"))
                    else category_of(article)
                ),
                "重點標記": "、".join(opening_tags),
                "開放內容說明": "；".join(opening_notes),
                "公告": article.title,
                "首次公開寵物": "、".join(debut_names),
                "公告連結": markdown_link("查看", article.url),
            }
        )
    # 開服初期的兩個關鍵事件跨越多篇公告，依公告內文合併成事件日紀錄。
    timeline_rows.extend(
        (
            {
                "日期": "2021-04-01",
                "類別": "活動／營運",
                "重點標記": "正式開服",
                "開放內容說明": (
                    "4月1日上午10點正式公測；玩家大量湧入後，官方緊急加開"
                    "「永恆獅子」伺服器"
                ),
                "公告": "《魔力寶貝：永恆初心》正式公測開服",
                "首次公開寵物": "",
                "公告連結": (
                    f'{markdown_link("公測公告", "https://cg.originmood.com/NewsContent/zh_TW/mlbb_notice_4503.html")}、'
                    f'{markdown_link("加開公告", "https://cg.originmood.com/NewsContent/zh_TW/mlbb_notice_4533.html")}'
                ),
            },
            {
                "日期": "2021-04-02",
                "類別": "活動／營運",
                "重點標記": "停服清檔",
                "開放內容說明": (
                    "官方宣布遊戲全面清檔，開機時間另行公布；伺服器進入全面調整維護"
                ),
                "公告": "伺服器問題導致停服調整與全面清檔",
                "首次公開寵物": "",
                "公告連結": (
                    f'{markdown_link("清檔公告", "https://cg.originmood.com/NewsContent/zh_TW/mlbb_news_4573.html")}、'
                    f'{markdown_link("維護公告", "https://cg.originmood.com/NewsContent/zh_TW/mlbb_notice_4563.html")}'
                ),
            },
        )
    )
    timeline_rows.sort(
        key=lambda row: (row["日期"], row["公告"]),
        reverse=True,
    )
    write_csv(
        DATA / "官方大事記.csv",
        ("日期", "類別", "重點標記", "開放內容說明", "公告", "首次公開寵物", "公告連結"),
        timeline_rows,
    )

    summary = {
        "公告數": len(articles),
        "日期起": min(article.date for article in articles),
        "日期迄": max(article.date for article in articles),
        "大事記數": len(timeline_rows),
        "官方寵物表格筆數": len(all_pets),
        "官方寵物名稱數": len(structured_by_name),
        "清單寵物數": len(local_by_name),
        "已標公告日": len(first_seen),
    }
    (CACHE / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
