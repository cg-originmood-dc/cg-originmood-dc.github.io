import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { hasLink } from './richtext';

const DATA_DIR = join(process.cwd(), 'content', 'data');

export interface Dataset {
  name: string;
  columns: string[];
  rows: Record<string, string>[];
  /** 有 image 欄位時，表格會渲染縮圖而不是印出路徑 */
  imageColumn: string | null;
  /** 適合做下拉篩選的欄位（原站寵物表就有「篩選類別」），沒有就是 null */
  filterColumn: { name: string; values: string[] } | null;
  /** 內容偏長、需要換行的欄位。其餘欄位不換行，免得「人形系」被擠成直書 */
  wrapColumns: string[];
  /**
   * 內容帶連結的補充欄位（像「任務用途」）。這種欄位只有少數列有值，
   * 會渲染成連結，並多給一個「只看有這欄的」勾選框。
   */
  noteColumn: string | null;
}

/**
 * 猜哪一欄適合當下拉篩選。
 * 判準是「重複度高、選項數少」——像種族、屬性、職業這種分類欄；
 * 名稱、數值那種幾乎每列都不同的欄不會中。
 */
function pickFilterColumn(
  columns: string[],
  rows: Record<string, string>[],
  skip: string | null,
): Dataset['filterColumn'] {
  if (rows.length < 12) return null;
  let best: { name: string; values: string[]; ratio: number } | null = null;
  for (const col of columns) {
    if (col === skip) continue;
    const seen = new Map<string, number>();
    for (const r of rows) {
      const v = (r[col] ?? '').trim();
      if (v) seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    const filled = [...seen.values()].reduce((a, b) => a + b, 0);
    if (seen.size < 2 || seen.size > 15) continue;
    if (filled < rows.length * 0.6) continue;
    // 數值欄（等級上限、能力值…）雖然也重複度高，但拿來篩選沒有意義
    const words = [...seen.keys()].filter((v) => !/^[-—－\d.%+]+$/.test(v));
    if (words.length < 2 || words.length < seen.size * 0.7) continue;
    // 每個選項平均要涵蓋夠多列，否則只是剛好選項少的雜項欄
    const ratio = filled / seen.size;
    if (ratio < 3) continue;
    if (!best || ratio > best.ratio) {
      best = { name: col, values: [...seen.keys()], ratio };
    }
  }
  if (!best) return null;
  const collator = new Intl.Collator('zh-Hant', { numeric: true });
  return { name: best.name, values: best.values.sort(collator.compare) };
}

const cache = new Map<string, Dataset | null>();

/**
 * 讀 content/data/<name>.csv。
 * 資料是編輯者的地盤，所以這裡刻意寬鬆：欄位隨他們增減，介面照著欄位長。
 */
export function loadDataset(name: string): Dataset | null {
  if (cache.has(name)) return cache.get(name)!;

  const file = join(DATA_DIR, `${name}.csv`);
  if (!existsSync(file)) {
    cache.set(name, null);
    return null;
  }

  // 檔案以 utf-8-sig 寫出（方便 Excel 開），這裡要吃掉 BOM
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const columns = records.length ? Object.keys(records[0]) : [];
  const imageColumn = columns.includes('image') ? 'image' : null;
  const dataset: Dataset = {
    name,
    columns,
    rows: records,
    imageColumn,
    noteColumn: columns.find((c) => records.some((r) => hasLink(r[c] ?? ''))) ?? null,
    filterColumn: pickFilterColumn(columns, records, imageColumn),
    wrapColumns: columns.filter((c) => {
      if (c === imageColumn) return false;
      const longest = records.reduce((m, r) => Math.max(m, (r[c] ?? '').length), 0);
      return longest > 18;
    }),
  };
  cache.set(name, dataset);
  return dataset;
}

export function listDatasets(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.csv'))
    .map((f) => f.slice(0, -4))
    .sort();
}
