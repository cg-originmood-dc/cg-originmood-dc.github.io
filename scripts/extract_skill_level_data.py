#!/usr/bin/env python3
"""從封存的舊技能總覽抽出每級技能資料，寫成 Astro 使用的 CSV。"""

import argparse
import csv
import re
from html.parser import HTMLParser
from pathlib import Path


class SkillPageParser(HTMLParser):
    """只讀取技能卡片的表格資料，不把寵物欄寫入技能資料。"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.card_depth: int | None = None
        self.card: dict[str, object] | None = None
        self.cards: list[dict[str, object]] = []
        self.skill_name: list[str] | None = None
        self.row: list[list[str]] | None = None
        self.cell: list[str] | None = None

    @staticmethod
    def _attrs(attrs: list[tuple[str, str | None]]) -> dict[str, str]:
        return {name: value or '' for name, value in attrs}

    @staticmethod
    def _text(parts: list[str]) -> str:
        return re.sub(r'\s+', ' ', ''.join(parts)).strip()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = self._attrs(attrs)
        classes = set(values.get('class', '').split())

        if tag == 'div' and 'skill-card-block' in classes:
            self.card_depth = self.depth
            self.card = {
                'scope': values.get('data-scope', ''),
                'category': values.get('data-category', ''),
                'name': '',
                'rows': [],
            }
        elif self.card is not None and tag == 'span' and 'skill-main-name' in classes:
            self.skill_name = []
        elif self.card is not None and tag == 'tr':
            self.row = []
        elif self.row is not None and tag == 'td':
            self.cell = []

        self.depth += 1

    def handle_endtag(self, tag: str) -> None:
        if self.card is not None and tag == 'td' and self.row is not None and self.cell is not None:
            self.row.append(self._text(self.cell))
            self.cell = None
        elif self.card is not None and tag == 'tr' and self.row is not None:
            if len(self.row) >= 3:
                rows = self.card['rows']
                assert isinstance(rows, list)
                rows.append(self.row)
            self.row = None
        elif self.skill_name is not None and tag == 'span':
            assert self.card is not None
            self.card['name'] = self._text(self.skill_name)
            self.skill_name = None

        self.depth -= 1
        if self.card is not None and tag == 'div' and self.depth == self.card_depth:
            self.cards.append(self.card)
            self.card = None
            self.card_depth = None

    def handle_data(self, data: str) -> None:
        if self.skill_name is not None:
            self.skill_name.append(data)
        if self.cell is not None:
            self.cell.append(data)


def extract(source: Path) -> list[dict[str, str]]:
    parser = SkillPageParser()
    parser.feed(source.read_text(encoding='utf-8'))
    output: list[dict[str, str]] = []
    for card in parser.cards:
        scope = {'char': 'char', 'pet': 'pet'}[str(card['scope'])]
        category = str(card['category'])
        name = str(card['name'])
        rows = card['rows']
        assert isinstance(rows, list)
        for row in rows:
            first, mp, description = row[:3]
            learning = row[3] if scope == 'pet' and len(row) >= 4 else ''
            output.append({
                '技能範圍': scope,
                '技能分類': category,
                '技能名稱': name,
                '技能等級': first,
                '魔力消耗': mp or '—',
                '技能效果詳細說明': description,
                '學習資訊': learning,
            })
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    project_root = Path(__file__).resolve().parents[1]
    parser.add_argument(
        '--source',
        type=Path,
        default=project_root.parent / 'archived' / '資料庫' / 'skills.html',
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=project_root / 'content' / 'data' / '技能等級.csv',
    )
    args = parser.parse_args()
    rows = extract(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            '技能範圍', '技能分類', '技能名稱', '技能等級', '魔力消耗', '技能效果詳細說明', '學習資訊',
        ], lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    print(f'寫入 {len(rows)} 筆技能等級資料：{args.output}')


if __name__ == '__main__':
    main()
