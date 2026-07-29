# -*- coding: utf-8 -*-
"""整理官方公告中的寵物合成活動與逐階配方。

產物：
  content/data/寵物合成總覽.csv
  content/data/寵物合成配方.csv

判定依據是公告表格同時具有「所需寵物、所需道具、獲得寵物」三欄。
下載的公告 HTML 與官方大事記同步器共用 .cache/official-news。
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from sync_official_news import ARTICLE_CACHE, DATA, NewsRef, clean, fetch, parse_index


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
SYNTH_HEADERS = ("所需寵物", "所需道具", "獲得寵物")
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


def article_path(ref: NewsRef) -> Path:
    return ARTICLE_CACHE / Path(urlparse(ref.url).path).name


def table_rows(table) -> list[list[str]]:
    rows: list[list[str]] = []
    for tr in table.find_all("tr"):
        cells = [
            clean(cell.get_text(" ", strip=True))
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
        if "NPC" in value.upper() or "（" in value:
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
    probability_outputs = re.findall(
        r"([^（(]{1,100}[（(](?:概率|機率)[^）)]*[）)])",
        value,
    )
    return unique(probability_outputs or re.split(r"(?=Lv\d)|[；;\n]", value))


def format_materials(value: str) -> str:
    value = clean(value).replace("*", "×")
    # 官方有「50,000G金幣」和「金幣100,000G」兩種寫法，統一後再拆材料。
    value = re.sub(r"(\d[\d,]*G)\s*金幣", r"金幣\1", value, flags=re.I)
    value = re.sub(
        r"([0-9G）)])\s+(?=[\u3400-\u9fffA-Za-z])",
        r"\1 ＋ ",
        value,
    )
    return value


def format_result(value: str) -> str:
    value = clean(value).replace("*", "×")
    value = re.sub(r"\s+([（(](?:概率|機率))", r"\1", value)
    return value


def synthesis_formula(required_pet: str, required_item: str, result_pet: str) -> str:
    left = f"{clean(required_pet)} ＋ {format_materials(required_item)}"
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

        chance_at = header_index(rows, ("物品名稱",))
        if chance_at is not None:
            header = normalized_header(rows[chance_at])
            probability_name = next(
                (name for name in ("概率", "機率") if name in header),
                None,
            )
            if probability_name:
                item_col = header.index("物品名稱")
                probability_col = header.index(probability_name)
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
        header_at = header_index(rows, SYNTH_HEADERS)
        if header_at is None:
            continue
        header = normalized_header(rows[header_at])
        pet_col = header.index("所需寵物")
        item_col = header.index("所需道具")
        result_col = header.index("獲得寵物")
        npc = npc_of(rows, header_at, table)
        period = activity_period(table, ref.date)
        for row in rows[header_at + 1 :]:
            if max(pet_col, item_col, result_col) >= len(row):
                continue
            required_pet = row[pet_col]
            required_item = row[item_col]
            result_pet = row[result_col]
            if (
                not required_pet
                or required_pet.strip() in {"/", "／", "-", "無"}
                or not required_item
                or not result_pet
            ):
                continue
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
        pet_method = "、".join(unique(pet_sources)) or "公告未另載"
        item_method = "、".join(unique(item_sources)) or "公告未另載"
        recipe.acquisition = f"所需寵物：{pet_method}；所需道具：{item_method}"
    return recipes


def write_csv(path: Path, columns: tuple[str, ...], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    refs = parse_index(refresh=True)
    all_recipes: list[Recipe] = []
    matching_articles = 0
    for ref in refs:
        path = article_path(ref)
        source = fetch(ref.url, path, refresh=False)
        recipes = parse_recipes(ref, source)
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
