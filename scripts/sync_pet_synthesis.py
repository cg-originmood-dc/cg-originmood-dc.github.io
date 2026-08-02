# -*- coding: utf-8 -*-
"""整理官方公告中的寵物合成活動與逐階配方。

產物：
  content/data/寵物合成總覽.csv
  content/data/寵物合成配方.csv

判定依據是公告表格同時具有「所需寵物、所需材料、產物寵物」三類欄位，
或是不需投入原寵、直接交付改造設計圖取得寵物；
官方歷年使用過的「所需道具／所需材料與數量」及
「獲得寵物／寵物／寵物名稱」欄名都會保留原文並納入。
下載的公告 HTML 與官方大事記同步器共用 .cache/official-news。
"""
from __future__ import annotations

import csv
import difflib
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup, NavigableString

from sync_official_news import (
    ARTICLE_CACHE,
    DATA,
    NewsRef,
    clean,
    fetch,
    parse_index,
    parse_pet_table,
)


DATE_TOKEN = re.compile(
    r"(?:(?P<year>20\d{2})年)?"
    r"(?P<month>\d{1,2})月(?P<day>\d{1,2})日"
    r"(?:\s*\d{1,2}[:：]\d{2}(?::\d{2})?)?"
)
DATE_TEXT = (
    r"(?:20\d{2}年)?\d{1,2}月\d{1,2}日"
    r"(?:\s*\d{1,2}[:：]\d{2}(?::\d{2})?)?"
)
RANGE_SEP = r"(?:--+|－+|—+|~|～|至)"
REQUIRED_PET_HEADERS = ("所需寵物", "需求寵物", "所需名稱")
REQUIRED_ITEM_HEADERS = (
    "所需道具",
    "所需材料",
    "所需材料與數量",
    "所需招財進寶錢幣數",
)
RESULT_PET_HEADERS = ("獲得寵物", "寵物", "寵物名稱")
CELL_LINE_BREAK = " / "


@dataclass
class Recipe:
    date: str
    period: str
    title: str
    url: str
    npc: str
    required_pet: str
    required_item: str
    result_pet: str
    tree: str
    acquisition: str = ""


@dataclass
class Source:
    key: str
    detail: str
    kind: str


@dataclass
class DesignGroup:
    result_pet: str
    items: list[str]
    item_sources: list[str]
    descriptions: list[str]
    summons: list[str]
    table: object


def article_path(ref: NewsRef) -> Path:
    return ARTICLE_CACHE / Path(urlparse(ref.url).path).name


def table_cell_text(cell) -> str:
    """保留 <br> 的分隔，但不在巢狀 inline 標籤間插入空白。"""
    parts: list[str] = []
    for node in cell.descendants:
        if isinstance(node, NavigableString):
            parts.append(str(node))
        elif getattr(node, "name", None) == "br":
            parts.append(" ")
    return clean("".join(parts))


def table_rows(table) -> list[list[str]]:
    rows: list[list[str]] = []
    for tr in table.find_all("tr"):
        cells = [
            table_cell_text(cell)
            for cell in tr.find_all(["th", "td"], recursive=False)
        ]
        if any(cells):
            rows.append(cells)
    return rows


def header_index(rows: list[list[str]], required: tuple[str, ...]) -> int | None:
    for index, row in enumerate(rows):
        compact = {re.sub(r"\s+", "", value) for value in row}
        if all(label in compact for label in required):
            return index
    return None


def normalized_header(row: list[str]) -> list[str]:
    return [re.sub(r"\s+", "", value) for value in row]


def synthesis_header(
    rows: list[list[str]],
) -> tuple[int, int | None, int, int] | None:
    for index, row in enumerate(rows):
        header = normalized_header(row)
        pet_name = next((name for name in REQUIRED_PET_HEADERS if name in header), None)
        item_name = next((name for name in REQUIRED_ITEM_HEADERS if name in header), None)
        result_name = next((name for name in RESULT_PET_HEADERS if name in header), None)
        if item_name and result_name:
            return (
                index,
                header.index(pet_name) if pet_name else None,
                header.index(item_name),
                header.index(result_name),
            )
    return None


def preceding_text(table) -> str:
    parts = [
        clean(str(node))
        for node in reversed(table.find_all_previous(string=True))
        if clean(str(node))
    ]
    return " ".join(parts)


def normalize_date_text(value: str) -> str:
    value = re.sub(r"(?<=\d)\s+(?=\d)", "", value)
    value = re.sub(r"\s*([年月日])\s*", r"\1", value)
    return clean(value)


def iso_date(match: re.Match[str], fallback_year: int) -> tuple[str, int, int]:
    year = int(match.group("year") or fallback_year)
    month = int(match.group("month"))
    day = int(match.group("day"))
    return f"{year:04d}-{month:02d}-{day:02d}", year, month


def activity_period(table, announcement_date: str) -> str:
    text = normalize_date_text(preceding_text(table))
    year = int(announcement_date[:4])
    matches: list[tuple[int, str]] = []
    pattern = re.compile(
        rf"活動(?:時間|日期)[：:]?\s*(?P<start>{DATE_TEXT})"
        rf".{{0,55}}?{RANGE_SEP}\s*(?P<end>{DATE_TEXT})"
    )
    for match in pattern.finditer(text):
        start_match = DATE_TOKEN.search(match.group("start"))
        end_match = DATE_TOKEN.search(match.group("end"))
        if not start_match or not end_match:
            continue
        start, start_year, start_month = iso_date(start_match, year)
        end, end_year, end_month = iso_date(end_match, start_year)
        if end_year < start_year:
            original_year = end_year
            end_year = start_year
            end = f"{end_year:04d}-{end_month:02d}-{int(end_match.group('day')):02d}"
            end += f"（公告原文末年為 {original_year}）"
        elif not end_match.group("year") and end_month < start_month:
            end_year += 1
            end = f"{end_year:04d}-{end_month:02d}-{int(end_match.group('day')):02d}"
        matches.append((match.start(), f"{start}～{end}"))
    if matches:
        return matches[-1][1]
    return f"未載明（公告日 {announcement_date}）"


def npc_of(rows: list[list[str]], header_at: int, table) -> str:
    for row in reversed(rows[:header_at]):
        value = clean(" ".join(row))
        if "NPC" in value.upper() or "（" in value or "(" in value:
            return value
    previous = preceding_text(table)
    matches = re.findall(r"NPC[：:]\s*([^。；]{2,80}?(?:\)|）))", previous, re.I)
    return clean(matches[-1]) if matches else "公告未載明"


def strip_level(value: str) -> str:
    value = clean(value)
    value = re.sub(r"^(?:任意等級的?|Lv\.?\s*\d+\s*的?)\s*", "", value, flags=re.I)
    value = re.sub(r"[（(]\s*(?:概|機)率[^）)]*[）)]", "", value)
    return re.sub(r"\s+", "", value)


def source_key(value: str) -> str:
    value = strip_level(value)
    value = re.sub(r"[*×xX]\s*\d+", "", value)
    return re.sub(r"[、,，；;。／/\s]", "", value)


def unique(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        value = clean(value)
        if value and value not in result:
            result.append(value)
    return result


def source_kind(value: str) -> str:
    compact = re.sub(r"\s+", "", value)
    return (
        "pet"
        if re.search(r"召喚書|寵物蛋|之卵|^Lv\.?\d", compact, re.I)
        else "item"
    )


def pet_key(value: str) -> str:
    key = source_key(value)
    key = re.sub(r"召喚書|寵物蛋|之卵$", "", key)
    return key


def output_parts(value: str) -> list[str]:
    value = clean(value)
    probability_matches = list(
        re.finditer(
            r"(?:概率|機率)\s*[\d.]+\s*%(?:\s*[）)])?",
            value,
        )
    )
    if len(probability_matches) > 1:
        parts: list[str] = []
        start = 0
        for match in probability_matches:
            part = clean(value[start : match.end()]).strip("、，；; ")
            if part:
                parts.append(part)
            start = match.end()
        remainder = clean(value[start:]).strip("、，；; ")
        if remainder:
            parts.append(remainder)
        return unique(parts)

    probability_outputs = re.findall(
        r"([^（(]{1,100}[（(](?:概率|機率)[^）)]*[）)])",
        value,
    )
    return unique(
        probability_outputs
        or re.split(r"(?=Lv\.?\s*\d)|[；;\n]", value, flags=re.I)
    )


def format_materials(value: str) -> str:
    value = clean(value).replace("*", "×")
    # 官方有「50,000G金幣」和「金幣100,000G」兩種寫法，統一後再拆材料。
    value = re.sub(r"(\d[\d,]*G)\s*金幣", r"金幣\1", value, flags=re.I)
    value = re.sub(
        r"金幣\s*(\d[\d,]*)G",
        lambda match: f"金幣{int(match.group(1).replace(',', '')):,}G",
        value,
        flags=re.I,
    )
    value = re.sub(
        r"([0-9A-Za-z）)])\s+(?=[\u3400-\u9fffA-Za-z])",
        r"\1 ＋ ",
        value,
    )
    return value


def format_result(value: str) -> str:
    value = clean(value).replace("*", "×")
    value = re.sub(r"\s+([（(](?:概率|機率))", r"\1", value)
    value = re.sub(
        r"(?<![（(])\s*((?:概率|機率)\s*[\d.]+\s*%)",
        r"（\1）",
        value,
    )
    return value


DESIGN_ITEM = re.compile(r"(.+?)設計圖([A-E])(?:\D|$)", re.I)
PRONOUN_BASES = {"它", "他", "他們", "牠", "牠們", "此寵物", "該寵物"}


def compact_name(value: str) -> str:
    return re.sub(r"\s+", "", clean(value)).strip("「」『』【】[]（）()，,。；;：:")


def design_groups(soup: BeautifulSoup) -> list[DesignGroup]:
    groups: dict[str, DesignGroup] = {}
    for table in soup.find_all("table"):
        rows = table_rows(table)
        summons = unique(
            [
                compact_name(match.group(1))
                for row in rows
                for cell in row
                for match in re.finditer(r"([^、，；|]{1,40}?)召喚書", cell)
            ]
        )
        for row in rows:
            compact_cells = [compact_name(cell) for cell in row]
            item_at = next(
                (
                    index
                    for index, cell in enumerate(compact_cells)
                    if DESIGN_ITEM.search(cell)
                ),
                None,
            )
            if item_at is None:
                continue
            match = DESIGN_ITEM.search(compact_cells[item_at])
            if not match:
                continue
            result_pet = compact_name(match.group(1))
            letter = match.group(2).upper()
            item = f"{result_pet}設計圖{letter}"
            key = compact_name(result_pet)
            group = groups.get(key)
            if not group:
                group = DesignGroup(
                    result_pet=result_pet,
                    items=[],
                    item_sources=[],
                    descriptions=[],
                    summons=summons,
                    table=table,
                )
                groups[key] = group
            if item not in group.items:
                group.items.append(item)
                chance = next(
                    (
                        compact_name(cell)
                        for cell in row
                        if re.fullmatch(r"\d+(?:\.\d+)?%", compact_name(cell))
                    ),
                    "",
                )
                group.item_sources.append(
                    f"{item}{f'（{chance}）' if chance else ''}"
                )
            description = clean(" ".join(row[item_at + 1 :]))
            if description and description not in group.descriptions:
                group.descriptions.append(description)

    # 至少 A、B、C 三張才視為一組改造設計圖，排除單一道具名稱誤判。
    return [
        group
        for group in groups.values()
        if {"A", "B", "C"}.issubset(
            {DESIGN_ITEM.search(item).group(2).upper() for item in group.items}
        )
    ]


def explicit_design_base(
    group: DesignGroup,
    article_text: str,
) -> str:
    result = re.escape(compact_name(group.result_pet))
    compact_descriptions = [compact_name(value) for value in group.descriptions]
    compact_article = re.sub(r"\s+", "", article_text)
    for value in [*compact_descriptions, compact_article]:
        for pattern in (
            rf"(?:把|將)([^，。；！!]{{1,35}}?)改造成{result}",
            rf"可將([^，。；！!]{{1,35}}?)改造為{result}",
            r"用於改造([^，。；！!]{1,30}?)的其中",
        ):
            match = re.search(pattern, value)
            if not match:
                continue
            base = compact_name(match.group(1))
            if (
                base
                and base not in PRONOUN_BASES
                and "設計圖" not in base
                and len(base) <= 20
            ):
                return base
    return ""


def common_suffix_length(left: str, right: str) -> int:
    length = 0
    for a, b in zip(reversed(left), reversed(right)):
        if a != b:
            break
        length += 1
    return length


def official_pet_names(soup: BeautifulSoup, ref: NewsRef) -> list[str]:
    return unique(
        [
            compact_name(pet.name)
            for table in soup.find_all("table")
            for pet in parse_pet_table(table, ref)
            if compact_name(pet.name)
        ]
    )


def canonical_pet_name(value: str, pet_names: list[str]) -> str:
    value = compact_name(value)
    candidates = [
        (
            difflib.SequenceMatcher(None, value, name).ratio(),
            name,
        )
        for name in pet_names
        if abs(len(value) - len(name)) <= 1
    ]
    if not candidates:
        return value
    candidates.sort(reverse=True)
    score, name = candidates[0]
    return name if score >= 0.8 else value


def inferred_design_base(group: DesignGroup) -> str:
    result = compact_name(group.result_pet)
    scored: list[tuple[int, str]] = []
    for summon in group.summons:
        base = compact_name(summon)
        contained = len(base) if base and base in result else 0
        suffix = common_suffix_length(result, base)
        score = max(contained, suffix)
        if score >= 2:
            scored.append((score, base))
    if not scored:
        return ""
    scored.sort(reverse=True)
    best_score = scored[0][0]
    best = unique([base for score, base in scored if score == best_score])
    return best[0] if len(best) == 1 else ""


def design_relation_catalog(
    articles: list[tuple[NewsRef, str]],
) -> dict[str, str]:
    evidence: dict[str, set[str]] = defaultdict(set)
    for _, source in articles:
        if "設計圖" not in source:
            continue
        soup = BeautifulSoup(source, "html.parser")
        article_text = clean(soup.get_text(" ", strip=True))
        for group in design_groups(soup):
            base = explicit_design_base(group, article_text) or inferred_design_base(group)
            if base:
                evidence[compact_name(group.result_pet)].add(base)
    return {
        result: next(iter(bases))
        for result, bases in evidence.items()
        if len(bases) == 1
    }


def legacy_design_recipes(
    ref: NewsRef,
    source: str,
    relation_catalog: dict[str, str],
) -> list[Recipe]:
    if "設計圖" not in source:
        return []
    soup = BeautifulSoup(source, "html.parser")
    article_text = clean(soup.get_text(" ", strip=True))
    pet_names = official_pet_names(soup, ref)
    recipes: list[Recipe] = []
    for group in design_groups(soup):
        result_key = compact_name(group.result_pet)
        required_pet = (
            explicit_design_base(group, article_text)
            or inferred_design_base(group)
            or relation_catalog.get(result_key, "")
        )
        if not required_pet:
            continue
        result_pet = canonical_pet_name(group.result_pet, pet_names)
        suffix_bases = [
            name
            for name in pet_names
            if name != result_pet and result_pet.endswith(name)
        ]
        required_pet = (
            max(suffix_bases, key=len)
            if suffix_bases
            else canonical_pet_name(required_pet, pet_names)
        )
        if compact_name(required_pet) == compact_name(result_pet):
            continue
        required_item = " ".join(f"{item}*1" for item in group.items)
        npc_match = re.search(r"找([^，。；]{1,20}?)進行改造", article_text)
        npc = (
            f"NPC：{compact_name(npc_match.group(1))}（公告未載明座標）"
            if npc_match
            else "公告未載明"
        )
        summons = [
            summon
            for summon in group.summons
            if canonical_pet_name(summon, [required_pet]) == required_pet
        ]
        pet_source = (
            f"當期寶盒／活動抽取：{summons[0]}召喚書"
            if summons
            else "公告明載需投入此寵物"
        )
        item_source = (
            "當期寶盒／活動抽取：" + "、".join(group.item_sources)
        )
        recipes.append(
            Recipe(
                date=ref.date,
                period=activity_period(group.table, ref.date),
                title=ref.title,
                url=ref.url,
                npc=npc,
                required_pet=required_pet,
                required_item=required_item,
                result_pet=result_pet,
                tree=synthesis_formula(
                    required_pet,
                    required_item,
                    result_pet,
                ),
                acquisition=f"所需寵物：{pet_source}；所需道具：{item_source}",
            )
        )
    return recipes


def synthesis_formula(required_pet: str, required_item: str, result_pet: str) -> str:
    materials = format_materials(required_item)
    pet = clean(required_pet)
    left = (
        materials
        if pet in {"", "/", "／", "-", "無", "不需要"}
        else f"{pet} ＋ {materials}"
    )
    results = [format_result(result) for result in output_parts(result_pet)]
    if len(results) == 1:
        return f"{left} ＝ {results[0]}"
    branches = [
        f"{'└' if index == len(results) - 1 else '├'} {result}"
        for index, result in enumerate(results)
    ]
    return CELL_LINE_BREAK.join([f"{left} ＝", *branches])


def text_sources(soup: BeautifulSoup) -> list[Source]:
    body = soup.select_one(".new-text") or soup.body or soup
    lines = [clean(line) for line in body.get_text("\n", strip=True).splitlines()]
    lines = [line for line in lines if line]
    sources: list[Source] = []
    for index, line in enumerate(lines):
        if "完成任務可獲得" in line:
            obtained = line.split("完成任務可獲得", 1)[1]
            obtained = re.split(r"以及|並可|，|。", obtained, maxsplit=1)[0]
            if obtained:
                sources.append(
                    Source(
                        source_key(obtained),
                        f"完成公告所述任務取得：{obtained}",
                        source_kind(obtained),
                    )
                )

        if "獎品輪換" in line:
            segment = " ".join(lines[index : index + 18])
            for item, probability in re.findall(
                r"([^、，；:：]{2,60})[（(](?:概率|機率)\s*([\d.]+%)[）)]",
                segment,
            ):
                item = clean(item)
                sources.append(
                    Source(
                        source_key(item),
                        f"公告所列任務獎品輪換：{item}（{probability}）",
                        source_kind(item),
                    )
                )

        if "可獲得以下獎品" in line:
            for candidate in lines[index + 1 : index + 45]:
                if re.search(r"^(?:以及|以上|活動時間|更新內容)", candidate):
                    break
                if (
                    1 < len(candidate) <= 60
                    and not candidate.isdigit()
                    and not re.fullmatch(r"[\d.%：:－—~～\s]+", candidate)
                ):
                    sources.append(
                        Source(
                            source_key(candidate),
                            f"公告所列活動獎勵／抽抽樂：{candidate}",
                            source_kind(candidate),
                        )
                    )
    return [source for source in sources if source.key]


def source_tables(soup: BeautifulSoup) -> list[Source]:
    sources: list[Source] = []
    for table in soup.find_all("table"):
        rows = table_rows(table)
        if not rows:
            continue

        chance_spec: tuple[int, int, int] | None = None
        for index, row in enumerate(rows):
            header = normalized_header(row)
            item_name = next(
                (
                    name
                    for name in ("物品名稱", "道具名稱", "名稱", "名字", "獎品名稱", "獎品")
                    if name in header
                ),
                None,
            )
            probability_col = next(
                (
                    column
                    for column, name in enumerate(header)
                    if "概率" in name or "機率" in name
                ),
                None,
            )
            if item_name and probability_col is not None:
                chance_spec = (index, header.index(item_name), probability_col)
                break
        if chance_spec is not None:
            chance_at, item_col, probability_col = chance_spec
            for row in rows[chance_at + 1 :]:
                if item_col >= len(row):
                    continue
                item = row[item_col]
                probability = row[probability_col] if probability_col < len(row) else ""
                if item:
                    detail = f"當期寶盒／活動抽取：{item}"
                    if probability:
                        detail += f"（{probability}）"
                    sources.append(
                        Source(source_key(item), detail, source_kind(item))
                    )

        output_at = header_index(rows, ("所需寵物", "所需道具", "獲得道具"))
        if output_at is not None:
            header = normalized_header(rows[output_at])
            pet_col = header.index("所需寵物")
            item_col = header.index("所需道具")
            output_col = header.index("獲得道具")
            npc = npc_of(rows, output_at, table)
            for row in rows[output_at + 1 :]:
                if output_col >= len(row):
                    continue
                required_pet = row[pet_col] if pet_col < len(row) else ""
                required_item = row[item_col] if item_col < len(row) else ""
                output = row[output_col]
                detail = f"向 {npc} 交付 {required_pet}＋{required_item} 取得"
                # 同一格可能列出多個機率產物，分開記錄避免混淆來源類型。
                for line in output_parts(output):
                    if clean(line):
                        sources.append(
                            Source(
                                source_key(line),
                                f"{detail}：{clean(line)}",
                                source_kind(line),
                            )
                        )

        # 常見的活動兌換表：獎品或獲得道具在前、所需材料在後。
        for output_name, material_name in (
            ("獎品", "所需材料與數量"),
            ("獲得道具", "所需道具"),
        ):
            exchange_at = header_index(rows, (output_name, material_name))
            if exchange_at is None:
                continue
            header = normalized_header(rows[exchange_at])
            if "所需寵物" in header:
                continue
            output_col = header.index(output_name)
            material_col = header.index(material_name)
            npc = npc_of(rows, exchange_at, table)
            for row in rows[exchange_at + 1 :]:
                if output_col >= len(row) or material_col >= len(row):
                    continue
                output = row[output_col]
                material = row[material_col]
                if output and material:
                    sources.append(
                        Source(
                            source_key(output),
                            f"向 {npc} 以 {material} 兌換：{output}",
                            source_kind(output),
                        )
                    )
    sources.extend(text_sources(soup))
    return [source for source in sources if source.key]


def matching_sources(value: str, sources: list[Source], kind: str) -> list[str]:
    key = source_key(value)
    if not key:
        return []
    if kind == "pet":
        wanted = pet_key(value)
        return unique(
            [
                source.detail
                for source in sources
                if source.kind == "pet" and pet_key(source.key) == wanted
            ]
        )
    matches = [
        source.detail
        for source in sources
        if source.kind == kind
        and source.key
        and (source.key in key or key in source.key)
    ]
    return unique(matches)


def parse_recipes(ref: NewsRef, source: str) -> list[Recipe]:
    soup = BeautifulSoup(source, "html.parser")
    recipes: list[Recipe] = []
    for table in soup.find_all("table"):
        rows = table_rows(table)
        synthesis_at = synthesis_header(rows)
        if synthesis_at is None:
            continue
        header_at, pet_col, item_col, result_col = synthesis_at
        npc = npc_of(rows, header_at, table)
        period = activity_period(table, ref.date)
        for row in rows[header_at + 1 :]:
            required_columns = [item_col, result_col]
            if pet_col is not None:
                required_columns.append(pet_col)
            if max(required_columns) >= len(row):
                continue
            required_pet = row[pet_col] if pet_col is not None else "不需要"
            required_item = row[item_col]
            result_pet = row[result_col]
            no_required_pet = required_pet.strip() in {"/", "／", "-", "無", "不需要"}
            if (
                not required_item
                or required_item.strip() in {"/", "／", "-", "無"}
                or not result_pet
                or (no_required_pet and "設計圖" not in required_item)
            ):
                continue
            if no_required_pet:
                required_pet = "不需要"
            recipes.append(
                Recipe(
                    date=ref.date,
                    period=period,
                    title=ref.title,
                    url=ref.url,
                    npc=npc,
                    required_pet=required_pet,
                    required_item=required_item,
                    result_pet=result_pet,
                    tree=synthesis_formula(required_pet, required_item, result_pet),
                )
            )

    sources = source_tables(soup)
    for recipe in recipes:
        recipe_sources = list(sources)
        for previous in recipes:
            if previous is recipe:
                break
            for output in output_parts(previous.result_pet):
                recipe_sources.append(
                    Source(
                        source_key(output),
                        f"前置合成：{previous.tree}",
                        source_kind(output),
                    )
                )
        pet_sources = matching_sources(recipe.required_pet, recipe_sources, "pet")
        item_sources = matching_sources(recipe.required_item, recipe_sources, "item")
        pet_method = (
            "不需要"
            if recipe.required_pet == "不需要"
            else "、".join(unique(pet_sources)) or "公告未另載"
        )
        item_method = "、".join(unique(item_sources)) or "公告未另載"
        recipe.acquisition = f"所需寵物：{pet_method}；所需道具：{item_method}"
    return recipes


def write_csv(path: Path, columns: tuple[str, ...], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=columns,
            extrasaction="ignore",
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    refs = parse_index(refresh=True)
    articles: list[tuple[NewsRef, str]] = []
    for ref in refs:
        path = article_path(ref)
        articles.append((ref, fetch(ref.url, path, refresh=False)))

    relation_catalog = design_relation_catalog(articles)
    all_recipes: list[Recipe] = []
    matching_articles = 0
    for ref, source in articles:
        recipes = parse_recipes(ref, source)
        legacy_recipes = legacy_design_recipes(ref, source, relation_catalog)
        existing_results = {
            source_key(output)
            for recipe in recipes
            for output in output_parts(recipe.result_pet)
        }
        recipes.extend(
            recipe
            for recipe in legacy_recipes
            if source_key(recipe.result_pet) not in existing_results
        )
        if recipes:
            matching_articles += 1
            all_recipes.extend(recipes)

    all_recipes.sort(key=lambda row: (row.date, row.title, row.npc, row.tree), reverse=True)
    detail_rows = [
        {
            "活動日期": recipe.period,
            "公告日": recipe.date,
            "活動／期別": recipe.title,
            "NPC": recipe.npc,
            "所需寵物": recipe.required_pet,
            "所需道具": recipe.required_item,
            "獲得寵物": recipe.result_pet,
            "合成樹": recipe.tree,
            "入手方法": recipe.acquisition,
            "公告連結": f"[查看]({recipe.url})",
        }
        for recipe in all_recipes
    ]
    detail_columns = (
        "活動日期",
        "公告日",
        "活動／期別",
        "NPC",
        "所需寵物",
        "所需道具",
        "獲得寵物",
        "合成樹",
        "入手方法",
        "公告連結",
    )
    write_csv(DATA / "寵物合成配方.csv", detail_columns, detail_rows)

    overview_rows: list[dict[str, str]] = []
    for recipe in all_recipes:
        overview_rows.append(
            {
                "活動日期": recipe.period,
                "公告日": recipe.date,
                "活動／期別": recipe.title,
                "合成公式": recipe.tree,
                "公告連結": f"[查看]({recipe.url})",
            }
        )
    overview_rows.sort(
        key=lambda row: (row["公告日"], row["活動／期別"]),
        reverse=True,
    )
    overview_columns = (
        "活動日期",
        "公告日",
        "活動／期別",
        "合成公式",
        "公告連結",
    )
    write_csv(DATA / "寵物合成總覽.csv", overview_columns, overview_rows)

    print(f"官方公告：{len(refs)} 篇")
    print(f"含合成表公告：{matching_articles} 篇")
    print(f"寵物合成公式：{len(overview_rows)} 條")
    print(f"寵物合成配方：{len(all_recipes)} 條")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
