/**
 * 軍方研究所配方（content/data/軍方研究所配方.csv）。
 *
 * 這裡只負責讀表跟回答「這隻寵在軍方研究所扮演什麼角色」；
 * 合成樹本體走 fusion/adapters/military.ts 進統一 IR，不在這裡長樹。
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type { ObtainMethod } from './pets';
import { normalizePetName } from './fusion/names';

export interface MilitaryLabRecipe {
  /** 1 = 洛伊克一改；2 = 拉拉克二改 */
  tier: 1 | 2;
  product: string;
  basePet: string;
  materials: Array<{ name: string; qty: number }>;
  npc: string;
}

/** 站內攻略路徑（BASE_URL 之後） */
export const MILITARY_LAB_PAGE = '/任務攻略/常態活動/軍方研究所';

/** 材料欄一格一項：「惡龍顱骨(1)、雷霆之力(5)」，跟料理的材料欄同一種寫法 */
function parseMaterials(raw: string, product: string): MilitaryLabRecipe['materials'] {
  return (raw ?? '')
    .split('、')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.+)\((\d+)\)$/);
      if (!m) {
        throw new Error(
          `軍方研究所配方.csv「${product}」的材料「${s}」不是「名稱(數量)」格式`,
        );
      }
      return { name: m[1].trim(), qty: Number(m[2]) };
    });
}

let cache: MilitaryLabRecipe[] | null = null;
let byProduct: Map<string, MilitaryLabRecipe> | null = null;
let byBase: Map<string, MilitaryLabRecipe[]> | null = null;
let cacheMtimeMs = 0;

function loadAll(): MilitaryLabRecipe[] {
  const file = join(process.cwd(), 'content', 'data', '軍方研究所配方.csv');
  if (!existsSync(file)) {
    cache = [];
    byProduct = new Map();
    byBase = new Map();
    cacheMtimeMs = 0;
    return cache;
  }
  const mtime = statSync(file).mtimeMs;
  if (cache && mtime === cacheMtimeMs) return cache;

  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  cache = rows
    .filter((r) => (r.產物 ?? '').trim())
    .map((r) => ({
      tier: (r.階段 === '二改' ? 2 : 1) as 1 | 2,
      product: normalizePetName(r.產物),
      basePet: normalizePetName(r.底寵),
      materials: parseMaterials(r.材料, r.產物),
      npc: r.NPC,
    }));
  byProduct = new Map(cache.map((r) => [r.product, r]));
  byBase = new Map();
  for (const r of cache) {
    const list = byBase.get(r.basePet) ?? [];
    list.push(r);
    byBase.set(r.basePet, list);
  }
  cacheMtimeMs = mtime;
  return cache;
}

export function listMilitaryLabRecipes(): MilitaryLabRecipe[] {
  return loadAll().slice();
}

function petAppearsInMilitaryLab(name: string): boolean {
  loadAll();
  return byProduct!.has(name) || byBase!.has(name);
}

/** 相關活動：連到軍方研究所攻略頁 */
export function militaryLabObtainMethods(
  petName: string,
  base = '',
): ObtainMethod[] {
  const name = normalizePetName(petName);
  if (!petAppearsInMilitaryLab(name)) return [];
  const b = base.replace(/\/$/, '');
  const asProduct = byProduct!.get(name);
  const asBase = byBase!.get(name) ?? [];
  const noteParts: string[] = [];
  if (asProduct) {
    noteParts.push(
      asProduct.tier === 2 ? '二改（拉拉克博士）' : '一改（洛伊克博士）',
    );
  }
  if (asBase.length) {
    noteParts.push(`可改造為：${asBase.map((r) => r.product).join('、')}`);
  }
  return [
    {
      type: 'fusion',
      map: '軍方研究所',
      note: noteParts.join('；') || undefined,
      link: `${b}${MILITARY_LAB_PAGE}`,
    },
  ];
}
