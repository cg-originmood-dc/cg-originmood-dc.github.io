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
  /** 每列一顆連到外部工具的按鈕，沒設定就是 null。見下方 ACTIONS */
  action: { label: string; column: string; url: (value: string) => string } | null;
  /**
   * 表格一進來就已經照這一欄排好了。只是把既成事實告訴 UI，不會去動列的順序。
   * 有值的話表頭會顯示排序箭頭，點下去直接反向，不會先跳到相反的方向再回來。
   */
  defaultSort: { column: string; dir: 'asc' | 'desc' } | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 找出「CSV 本來就照它排好」的日期欄。
 *
 * 條件刻意訂得嚴：必須是日期欄，而且整份資料已經單調遞增或遞減。
 * 只看「有沒有日期欄」是不夠的 —— 寵物表也有「公告日」，但它是照名稱排的，
 * 認成排序欄的話等於謊報，使用者一點表頭 1069 列就會整個跳掉。
 *
 * 只挑 ISO 日期是因為它字串比較跟日期比較同序，前端那個
 * Intl.Collator（numeric: true）算出來也一樣，三邊不會打架。
 */
function pickDefaultSort(
  columns: string[],
  rows: Record<string, string>[],
): Dataset['defaultSort'] {
  if (rows.length < 3) return null;
  for (const col of columns) {
    const values = rows.map((r) => (r[col] ?? '').trim());
    const filled = values.filter(Boolean);
    if (filled.length < rows.length * 0.9) continue;
    if (!filled.every((v) => ISO_DATE.test(v))) continue;
    const desc = filled.every((v, i) => i === 0 || filled[i - 1] >= v);
    const asc = filled.every((v, i) => i === 0 || filled[i - 1] <= v);
    if (desc) return { column: col, dir: 'desc' };
    if (asc) return { column: col, dir: 'asc' };
  }
  return null;
}

/**
 * 資料表接外部工具的按鈕。
 *
 * 這是介面層的設定而不是資料：寫進 CSV 的話 1069 列每一列都要重複同一個網址，
 * 而且會被 noteColumn 當成「帶連結的補充欄」搶走（「任務用途」就不會被認出來）。
 */
const ACTIONS: Record<string, NonNullable<Dataset['action']>> = {
  專屬寵物: {
    label: '算檔次',
    column: '名稱',
    url: (v) => `https://cg-originmood-dc.github.io/monster-remake/?q=${encodeURIComponent(v)}`,
  },
};

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
    // 可能同時有「公告連結」與稀疏的「任務用途」；勾選器應選最稀疏、
    // 最像補充註記的連結欄，而不是第一個碰到的連結欄。
    noteColumn:
      columns
        .map((c) => ({
          name: c,
          linked: records.filter((r) => hasLink(r[c] ?? '')).length,
        }))
        .filter((c) => c.linked > 0)
        .sort((a, b) => a.linked - b.linked)[0]?.name ?? null,
    action: ACTIONS[name] && columns.includes(ACTIONS[name].column) ? ACTIONS[name] : null,
    defaultSort: pickDefaultSort(columns, records),
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
