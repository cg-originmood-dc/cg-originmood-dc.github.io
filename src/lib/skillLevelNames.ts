import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

export type SkillAppliesTo = '人物' | '寵物';

export interface SkillTokenResolution {
  skill: string;
  side: SkillAppliesTo;
  level: number | null;
  matchedBy: '技能名稱' | '等級格式' | '顯示名稱' | '別名';
}

interface SkillNameCatalog {
  canonicalNames: Set<string>;
  tokenIndex: Map<string, SkillTokenResolution>;
  aliasesByLevel: Map<string, string[]>;
}

let cache: SkillNameCatalog | null = null;
let cacheKey = '';
let nextMtimeCheck = 0;

function readCsv(file: string): Record<string, string>[] {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
  return parse(text, { columns: true, skip_empty_lines: true, trim: true });
}

function levelKey(skill: string, side: SkillAppliesTo, level: string | number): string {
  return `${skill.trim()}\0${side}\0${String(level).trim()}`;
}

function tokenKey(side: SkillAppliesTo, token: string): string {
  return `${side}\0${token.trim()}`;
}

function addToken(
  index: Map<string, SkillTokenResolution>,
  token: string,
  resolution: SkillTokenResolution,
): void {
  const key = tokenKey(resolution.side, token);
  const existing = index.get(key);
  if (
    existing
    && (existing.skill !== resolution.skill || existing.level !== resolution.level)
  ) {
    throw new Error(
      `技能等級名稱「${token}」同時對應 ${existing.skill} LV${existing.level} 與 ${resolution.skill} LV${resolution.level}`,
    );
  }
  index.set(key, resolution);
}

function loadCatalog(forceMtimeCheck = false): SkillNameCatalog {
  const now = Date.now();
  if (!forceMtimeCheck && cache && now < nextMtimeCheck) return cache;
  nextMtimeCheck = now + 1_000;

  const dataDir = join(process.cwd(), 'content', 'data');
  const overviewFile = join(dataDir, '技能總覽.csv');
  const levelsFile = join(dataDir, '技能等級效果.csv');
  const aliasesFile = join(dataDir, '技能等級別名.csv');
  const files = [overviewFile, levelsFile, aliasesFile];
  const key = files.map((file) => (existsSync(file) ? statSync(file).mtimeMs : 0)).join('|');
  if (cache && key === cacheKey) return cache;

  const overviewRows = readCsv(overviewFile);
  const levelRows = readCsv(levelsFile);
  const aliasRows = readCsv(aliasesFile);
  const canonicalNames = new Set(
    overviewRows.map((row) => (row.技能 ?? '').trim()).filter(Boolean),
  );
  const existingLevels = new Set(
    levelRows.map((row) => levelKey(
      row.技能 ?? '',
      row.適用 as SkillAppliesTo,
      row.等級 ?? '',
    )),
  );
  const tokenIndex = new Map<string, SkillTokenResolution>();
  const aliasesByLevel = new Map<string, string[]>();

  for (const row of levelRows) {
    const displayName = (row.顯示名稱 ?? '').trim();
    const skill = (row.技能 ?? '').trim();
    const side = row.適用 as SkillAppliesTo;
    const level = Number(row.等級);
    if (!displayName || !skill || !Number.isFinite(level)) continue;
    addToken(tokenIndex, displayName, {
      skill,
      side,
      level,
      matchedBy: '顯示名稱',
    });
  }

  for (const row of aliasRows) {
    const skill = (row.技能 ?? '').trim();
    const side = row.適用 as SkillAppliesTo;
    const levelText = (row.等級 ?? '').trim();
    const alias = (row.別名 ?? '').trim();
    const level = Number(levelText);
    if (!skill || !alias || !Number.isFinite(level)) continue;
    if (!canonicalNames.has(skill)) {
      throw new Error(`技能等級別名「${alias}」指向不存在的技能「${skill}」`);
    }
    const targetKey = levelKey(skill, side, levelText);
    if (!existingLevels.has(targetKey)) {
      throw new Error(`技能等級別名「${alias}」指向不存在的 ${skill}／${side}／LV${levelText}`);
    }
    addToken(tokenIndex, alias, {
      skill,
      side,
      level,
      matchedBy: '別名',
    });
    const aliases = aliasesByLevel.get(targetKey) ?? [];
    if (!aliases.includes(alias)) aliases.push(alias);
    aliasesByLevel.set(targetKey, aliases);
  }

  cache = { canonicalNames, tokenIndex, aliasesByLevel };
  cacheKey = key;
  return cache;
}

function cleanSkillToken(raw: string): string {
  return raw
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/；.*$/, '')
    .trim();
}

/**
 * 將公告／寵物表中的技能原文對應到「技能＋等級」。
 *
 * 只接受三種明確關係：
 * 1. 完整技能名稱；2. 技能名稱 + LV 數字；3. 資料表列出的顯示名稱或別名。
 * 不推測尾端羅馬數字，避免把「乾坤一擲點睛I」誤認為「乾坤一擲 LV1」。
 */
export function resolveSkillToken(
  raw: string,
  side: SkillAppliesTo = '寵物',
): SkillTokenResolution | null {
  const token = cleanSkillToken(raw);
  if (!token) return null;
  const catalog = loadCatalog();
  const indexed = catalog.tokenIndex.get(tokenKey(side, token));
  if (indexed) return indexed;
  if (catalog.canonicalNames.has(token)) {
    return { skill: token, side, level: null, matchedBy: '技能名稱' };
  }

  const levelMatch = token.match(/^(.*?)\s*LV\s*(\d+).*$/i);
  if (!levelMatch) return null;
  const skill = levelMatch[1].trim();
  const level = Number(levelMatch[2]);
  if (!catalog.canonicalNames.has(skill) || !Number.isFinite(level)) return null;
  return { skill, side, level, matchedBy: '等級格式' };
}

export function aliasesForSkillLevel(
  skill: string,
  side: SkillAppliesTo,
  level: string | number,
): string[] {
  return [...(loadCatalog().aliasesByLevel.get(levelKey(skill, side, level)) ?? [])];
}

/** 資料載入器每次偵測到 CSV 變更時強制同步一次，其餘大量查詢沿用快取。 */
export function refreshSkillLevelNames(): void {
  loadCatalog(true);
}
