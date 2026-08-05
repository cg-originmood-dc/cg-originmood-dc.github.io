/**
 * 技能資料（SSOT）：
 * - content/data/技能總覽.csv     一列＝一個「技能 × 適用側」（人物／寵物）
 * - content/data/技能等級效果.csv  一列＝該側某等級的魔耗／效果（缺的等級就是沒資料）
 * - content/data/技能等級別名.csv  一列＝某個明確技能等級的其他既有寫法
 *
 * 同名技能人寵兩側是不同的東西（連擊人物到 LV15、寵物只到 LV5，
 * 魔耗效果也不同），所以兩張表都以（技能, 適用）為鍵；
 * 一個技能名對應一個 SkillEntry，兩側各自掛在 char / pet 下。
 *
 * 「持有寵物」不在這裡——那是 專屬寵物.csv 技能欄推導的（pets.listPetsWithSkill），
 * 寫死在技能資料裡會跟寵物表脫鉤。
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { anyPetHasSkill } from './pets';
import {
  aliasesForSkillLevel,
  refreshSkillLevelNames,
  type SkillAppliesTo,
} from './skillLevelNames';

export interface SkillLevelRow {
  /** 空字串＝這筆沒有等級（寵物一般技能那批） */
  等級: string;
  魔力消耗: string;
  成功率倍率: string;
  作用範圍: string;
  效果: string;
  /** 寵物側才有：學習限制／費用／NPC／地點，以「；」分段 */
  學習資訊: string;
  /** 遊戲內該等級的主要名稱；可能與技能本體名稱不同 */
  顯示名稱: string;
  /** 同一技能等級在公告或既有資料中的其他明確寫法 */
  別名: string[];
}

export interface SkillSide {
  分類: string;
  /** 空字串＝無等級技能，或目前只有已確認的個別等級 */
  最高等級: string;
  備註: string;
  levels: SkillLevelRow[];
}

export interface SkillEntry {
  name: string;
  char?: SkillSide;
  pet?: SkillSide;
}

let cache: SkillEntry[] | null = null;
let byName: Map<string, SkillEntry> | null = null;
let cacheKey = '';

function readCsv(file: string): Record<string, string>[] {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  return parse(text, { columns: true, skip_empty_lines: true, trim: true });
}

function loadAll(): SkillEntry[] {
  const ovFile = join(process.cwd(), 'content', 'data', '技能總覽.csv');
  const lvFile = join(process.cwd(), 'content', 'data', '技能等級效果.csv');
  const aliasFile = join(process.cwd(), 'content', 'data', '技能等級別名.csv');
  const key = [ovFile, lvFile, aliasFile]
    .map((f) => (existsSync(f) ? statSync(f).mtimeMs : 0))
    .join('|');
  if (cache && key === cacheKey) return cache;

  // 避免開發模式中別名 CSV 剛變更時，下面各列讀到上一版的短期查詢快取。
  refreshSkillLevelNames();

  const levels = new Map<string, SkillLevelRow[]>();
  for (const r of readCsv(lvFile)) {
    const k = `${r.技能}\0${r.適用}`;
    const list = levels.get(k) ?? [];
    list.push({
      等級: r.等級 ?? '',
      魔力消耗: r.魔力消耗 ?? '',
      成功率倍率: r.成功率倍率 ?? '',
      作用範圍: r.作用範圍 ?? '',
      效果: r.效果 ?? '',
      學習資訊: r.學習資訊 ?? '',
      顯示名稱: r.顯示名稱 ?? '',
      別名: aliasesForSkillLevel(
        r.技能 ?? '',
        r.適用 as SkillAppliesTo,
        r.等級 ?? '',
      ),
    });
    levels.set(k, list);
  }

  cache = [];
  byName = new Map();
  const attachedLevelGroups = new Set<string>();
  for (const r of readCsv(ovFile)) {
    const name = (r.技能 ?? '').trim();
    if (!name) continue;
    let entry = byName.get(name);
    if (!entry) {
      entry = { name };
      byName.set(name, entry);
      cache.push(entry);
    }
    const side: SkillSide = {
      分類: r.分類 ?? '',
      最高等級: r.最高等級 ?? '',
      備註: r.備註 ?? '',
      levels: levels.get(`${name}\0${r.適用}`) ?? [],
    };
    attachedLevelGroups.add(`${name}\0${r.適用}`);
    if (r.適用 === '寵物') entry.pet = side;
    else entry.char = side;
  }

  // 等級資料本身就是「技能 × 適用側」的關係。總覽尚未補齊該側時仍掛回技能，
  // 但不猜分類或最高等級，只呈現已確認的個別等級。
  for (const [key, sideLevels] of levels) {
    if (attachedLevelGroups.has(key)) continue;
    const [name, appliesTo] = key.split('\0') as [string, SkillAppliesTo];
    const entry = byName.get(name);
    if (!entry) {
      throw new Error(`技能等級資料「${name}／${appliesTo}」在技能總覽中找不到技能本體`);
    }
    const side: SkillSide = {
      分類: '',
      最高等級: '',
      備註: '僅列出已確認的個別等級',
      levels: sideLevels,
    };
    if (appliesTo === '寵物') entry.pet = side;
    else entry.char = side;
  }
  cacheKey = key;
  return cache;
}

/** 全部技能（CSV 順序；共用技能只出現一次，兩側掛同一個 entry） */
export function listSkills(): SkillEntry[] {
  return loadAll();
}

export function getSkill(name: string): SkillEntry | null {
  loadAll();
  return byName?.get(name.trim()) ?? null;
}

/**
 * 技能詳情頁的網址三分：人專屬 /skill/char/、寵專屬 /skill/pet/、
 * 人寵共用放 /skill/shared/。每個技能只有一個正式網址。
 *
 * 「共用」不只看技能表兩側都有列：技能表只有人物側、但專屬寵物的技能欄
 * 記載有寵持有的（恢復魔法那批），也算共用——「寵物側沒有等級表」跟
 * 「寵物不會這招」是兩回事，持有資料說了算。
 */
export type SkillScope = 'char' | 'pet' | 'shared';

export function skillScope(name: string): SkillScope | null {
  const e = getSkill(name);
  if (!e) return null;
  if (e.char && e.pet) return 'shared';
  if (e.char) return anyPetHasSkill(e.name) ? 'shared' : 'char';
  return 'pet';
}

/**
 * 技能詳情頁路徑（已編碼、不含 base）；查不到回 null——
 * 寵物頁技能欄「查得到才給連結」的守門就靠這個（對齊 hasItem / hasPet）。
 */
export function skillPath(name: string): string | null {
  const scope = skillScope(name);
  return scope ? `/skill/${scope}/${encodeURIComponent(name.trim())}` : null;
}

/** 側別中文（模板顯示用） */
export const SIDE_LABEL = { char: '人物技能', pet: '寵物技能' } as const;

/** 分類 → 卡片小圖示（純裝飾，缺分類就給通用符號） */
const CATEGORY_ICON: Record<string, string> = {
  戰鬥攻擊技能: '⚔️',
  戰鬥防禦技能: '🛡️',
  戰鬥輔助技能: '✨',
  屬性攻擊魔法: '🔥',
  狀態變化魔法: '💤',
  戰鬥輔助魔法: '🩹',
  其他特殊技能: '🌀',
  生產製作技能: '🛠️',
  寵物一般技能: '🐾',
  寵物戰鬥技能: '⚔️',
  寵物魔法技能: '🔮',
  狀態攻擊技能: '💫',
  狀態抵抗技能: '🛡️',
};

export function skillIcon(category: string): string {
  return CATEGORY_ICON[category] ?? '⚡';
}

/** 魔耗顯示：CSV 存純數字，這裡補「MP」單位；描述性文字（依等級變化…）原樣 */
export function mpLabel(v: string): string {
  const s = (v ?? '').trim();
  if (!s) return '—';
  return /^\d+$/.test(s) ? `${s} MP` : s;
}
