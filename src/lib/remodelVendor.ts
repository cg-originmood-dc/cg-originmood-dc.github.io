/**
 * 初心寵物大改造／改造寵購買 NPC（content/data/改造寵販售.csv）。
 *
 * 合成規則：產物 ＝ 底寵 ＋ 改造圖A ＋ 改造圖B ＋ …（依「改造圖」欄逐字展開，
 * 「ABCDE」是改造圖A～E 各一張，不是「改造圖 檔次標籤」）。
 * 底寵直接寫在表裡，不靠剝「改造」前綴猜——禁地妖花→妖花、
 * 改造陰影→兔耳嚇人箱這種不規律命名猜不出來。
 *
 * 合成樹本體走 fusion/adapters/remodel.ts 進統一 IR。
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type { ObtainMethod } from './pets';
import { normalizePetName } from './fusion/names';

/** 站內來源頁（BASE_URL 之後） */
export const REMODEL_VENDOR_PAGE = '/魔力豆知識';

/** 合成材料道具前綴：「ABCDE」→ 改造圖A、改造圖B…改造圖E */
const REMODEL_BLUEPRINT_PREFIX = '改造圖';

/** 改造圖欄字串如 "ABC" / "ABCDE" → ["改造圖A","改造圖B","改造圖C"] */
function remodelBlueprintItems(grades: string): string[] {
  const letters = (grades ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('');
  // 保序去重
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of letters) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(`${REMODEL_BLUEPRINT_PREFIX}${ch}`);
  }
  return out;
}

/**
 * 合成圖用：改造產物配方
 * 原寵 + 改造圖A + 改造圖B + …（依「改造圖」欄展開）
 */
export interface RemodelFusionRecipe {
  product: string;
  basePet: string;
  /** 如 ["改造圖A","改造圖B","改造圖C"] */
  blueprintItems: string[];
  /** 原始改造圖欄字串，如 ABCDE */
  grades: string;
  npc: string;
  location?: string;
  quest?: string;
}

/** 一列＝一個 NPC 賣一隻寵 */
interface VendorRow {
  product: string;
  basePet: string;
  grades: string;
  npc: string;
  location?: string;
  quest?: string;
}

let rowsCache: VendorRow[] | null = null;
let byPet: Map<string, VendorRow[]> | null = null;
let recipes: RemodelFusionRecipe[] | null = null;
let cacheMtimeMs = 0;

function loadAll(): VendorRow[] {
  const file = join(process.cwd(), 'content', 'data', '改造寵販售.csv');
  if (!existsSync(file)) {
    rowsCache = [];
    byPet = new Map();
    recipes = [];
    cacheMtimeMs = 0;
    return rowsCache;
  }
  const mtime = statSync(file).mtimeMs;
  if (rowsCache && mtime === cacheMtimeMs) return rowsCache;

  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  const raw = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  rowsCache = raw
    .filter((r) => (r.產物 ?? '').trim())
    .map((r) => ({
      product: normalizePetName(r.產物),
      // 底寵不過產物別名表（攻略把「兔耳嚇人箱(改造陰影)」當產物別名，
      // 但兔耳嚇人箱本身是改造陰影的底寵，過表會把底寵改成產物）
      basePet: (r.底寵 ?? '').trim(),
      grades: (r.改造圖 ?? '').trim(),
      npc: r.NPC,
      location: (r.座標 ?? '').trim() || undefined,
      quest: (r.前置任務 ?? '').trim() || undefined,
    }));

  byPet = new Map();
  recipes = [];
  const seenProduct = new Set<string>();
  for (const row of rowsCache) {
    const list = byPet.get(row.product) ?? [];
    list.push(row);
    byPet.set(row.product, list);

    // 同一產物多個購買 NPC 時配方相同，只建一條合成邊
    if (seenProduct.has(row.product) || !row.basePet) continue;
    const blueprints = remodelBlueprintItems(row.grades);
    if (!blueprints.length) continue;
    seenProduct.add(row.product);
    recipes.push({
      product: row.product,
      basePet: row.basePet,
      blueprintItems: blueprints,
      grades: row.grades,
      npc: row.location ? `${row.npc}（${row.location}）` : row.npc,
      location: row.location,
      quest: row.quest,
    });
  }
  cacheMtimeMs = mtime;
  return rowsCache;
}

/** 全部「原寵 + 改造圖 → 改造寵」配方（已去重） */
export function listRemodelFusionRecipes(): RemodelFusionRecipe[] {
  loadAll();
  return recipes!.slice();
}

/**
 * 入手細項：購買 NPC + 改造圖 + 任務／座標，連回魔力豆知識。
 */
export function remodelVendorObtainMethods(
  petName: string,
  base = '',
): ObtainMethod[] {
  loadAll();
  const hits = byPet!.get(normalizePetName(petName)) ?? [];
  if (!hits.length) return [];
  const b = base.replace(/\/$/, '');
  const link = `${b}${REMODEL_VENDOR_PAGE}`;

  return hits.map((row) => {
    const noteParts: string[] = [];
    if (row.quest) noteParts.push(`任務：${row.quest}`);
    const maps = remodelBlueprintItems(row.grades);
    if (row.basePet && maps.length) {
      noteParts.push(`合成：${row.basePet} ＋ ${maps.join(' ＋ ')}`);
    } else if (row.grades) {
      noteParts.push(`設計圖 ${row.grades.split('').join('/')}`);
    }
    return {
      type: 'exchange',
      map: row.location ? `${row.npc}（${row.location}）` : row.npc,
      note: noteParts.join('；') || undefined,
      link,
    };
  });
}
