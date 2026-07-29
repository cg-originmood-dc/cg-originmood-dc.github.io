/**
 * 道具庫 SSOT：content/data/道具庫.csv
 * 合成樹、道具總覽、道具詳情都從這裡取名稱／圖／分類。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

export interface ItemRecord {
  名稱: string;
  分類: string;
  子分類: string;
  等級: string;
  說明: string;
  入手方式: string;
  image: string;
  [key: string]: string;
}

let cache: ItemRecord[] | null = null;
let byName: Map<string, ItemRecord> | null = null;
let mtimeMs = 0;

function loadAll(): ItemRecord[] {
  const file = join(process.cwd(), 'content', 'data', '道具庫.csv');
  const mtime = existsSync(file) ? statSync(file).mtimeMs : 0;
  if (cache && mtime === mtimeMs) return cache;
  mtimeMs = mtime;
  if (!existsSync(file)) {
    cache = [];
    byName = new Map();
    return cache;
  }
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as ItemRecord[];
  cache = rows.filter((r) => (r.名稱 ?? '').trim());
  byName = new Map(cache.map((r) => [r.名稱.trim(), r]));
  return cache;
}

export function listItems(): ItemRecord[] {
  return loadAll();
}

export function getItem(name: string): ItemRecord | undefined {
  loadAll();
  return byName?.get(name.trim());
}

/**
 * 道具圖路徑：只認道具庫 CSV 的 image。
 * 無列或無圖 → 空字串（UI 可退回 icon，不亂猜路徑）。
 */
export function itemImagePath(name: string): string {
  const row = getItem(name);
  return (row?.image ?? '').trim();
}

/** 是否在道具庫中（合成樹連結用） */
export function hasItem(name: string): boolean {
  return !!getItem(name);
}

/**
 * 無圖時的文字佔位（不用 emoji）。
 * 回傳分類短標，UI 以樣式呈現即可。
 */
export function itemFallbackLabel(name: string): string {
  const cat = (getItem(name)?.分類 ?? '').trim();
  if (cat) return cat;
  if (/金幣|\d+G$/.test(name)) return '金幣';
  return '道具';
}

/** @deprecated 改用 itemFallbackLabel，保留別名避免舊呼叫炸掉 */
export function itemFallbackIcon(name: string): string {
  return itemFallbackLabel(name);
}
