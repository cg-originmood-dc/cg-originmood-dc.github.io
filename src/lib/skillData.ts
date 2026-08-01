import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import {
  isSkillSpVariantLabel,
  listPets,
  listPetsWithSkill,
  parseSkillLevel,
  skillMatchesPage,
  skillSpLabel,
  splitSkills,
  type PetSkillHolder,
} from './pets';

export interface SkillRecord {
  技能名稱: string;
  技能分類: string;
  技能來源: string;
  最高等級: string;
  簡介: string;
  /** 學習資訊（可含 Markdown 任務連結）；可空 */
  學習資訊?: string;
  /** 學習價格，如 100G；可空 */
  價格?: string;
  技能範圍: 'char' | 'pet';
}

export type SkillScope = 'character' | 'pet';

/**
 * 技能詳情路由用的合併資料：同名技能的人物／寵物側各自保留，
 * 但詳情頁只產生一個入口，由 skillScope 決定 URL 的三分法。
 */
export interface SkillEntry {
  name: string;
  char?: SkillRecord;
  pet?: SkillRecord;
}

export type SkillRouteScope = 'char' | 'pet' | 'shared';

export interface SkillLevelRow {
  level: number | null;
  label: string;
  mp: string;
  description: string;
  learningInfo: string;
  holders: PetSkillHolder[];
}

export interface SkillVariant {
  skill: SkillRecord;
  scope: SkillScope;
  category: string;
  categoryKey: string;
  holders: PetSkillHolder[];
  levels: SkillLevelRow[];
}

export interface SkillParseIssue {
  petName: string;
  raw: string;
  reason: string;
}

const skillCsvPath = join(process.cwd(), 'content', 'data', '技能庫.csv');
const skillLevelCsvPath = join(process.cwd(), 'content', 'data', '技能等級.csv');

let skillCache: SkillRecord[] | null = null;
let skillLevelCache: SkillLevelData[] | null = null;
let skillLevelMap: Map<string, SkillLevelData[]> | null = null;
let skillEntryCache: SkillEntry[] | null = null;
let skillEntryMtime = 0;

interface SkillLevelData {
  技能範圍: 'char' | 'pet';
  技能分類: string;
  技能名稱: string;
  技能等級: string;
  魔力消耗: string;
  技能效果詳細說明: string;
  學習資訊: string;
}

function readSkillCsv(): SkillRecord[] {
  const source = readFileSync(skillCsvPath, 'utf8').replace(/^\uFEFF/, '');
  const rows = parse(source, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as SkillRecord[];
  return rows.map(normalizeSkillRecord);
}

export function listSkills(): SkillRecord[] {
  // content/data 變更在 dev 需立即生效；production 再快取
  if (import.meta.env.DEV) return readSkillCsv();
  return (skillCache ??= readSkillCsv());
}

/** 將技能庫的「一列一側」資料合併成 main 技能詳情使用的 SkillEntry。 */
export function listSkillEntries(): SkillEntry[] {
  const mtime = existsSync(skillCsvPath) ? statSync(skillCsvPath).mtimeMs : 0;
  if (skillEntryCache && mtime === skillEntryMtime) return skillEntryCache;

  const byName = new Map<string, SkillEntry>();
  for (const skill of listSkills()) {
    const name = (skill.技能名稱 || '').trim();
    if (!name) continue;
    const entry = byName.get(name) ?? { name };
    if (skill.技能範圍 === 'pet') entry.pet = skill;
    else entry.char = skill;
    byName.set(name, entry);
  }
  skillEntryCache = [...byName.values()];
  skillEntryMtime = mtime;
  return skillEntryCache;
}

export function getSkillEntry(name: string): SkillEntry | undefined {
  const decoded = decodeURIComponent(name).trim();
  return listSkillEntries().find((entry) => entry.name === decoded);
}

/** main 的技能詳情網址三分：人物專屬、寵物專屬、同名共用技能。 */
export function skillScope(name: string): SkillRouteScope | null {
  const entry = getSkillEntry(name);
  if (!entry) return null;
  if (entry.char && entry.pet) return 'shared';
  return entry.char ? 'char' : 'pet';
}

/** 回傳不含 base path 的 canonical 技能詳情路徑。 */
export function skillPath(name: string): string | null {
  const scope = skillScope(name);
  return scope ? `/skill/${scope}/${encodeURIComponent(name.trim())}` : null;
}

function readSkillLevelCsv(): SkillLevelData[] {
  const source = readFileSync(skillLevelCsvPath, 'utf8').replace(/^\uFEFF/, '');
  const rows = parse(source, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as SkillLevelData[];
  return rows.map(normalizeSkillLevelData);
}

function getSkillLevelMap(): Map<string, SkillLevelData[]> {
  if (skillLevelMap) return skillLevelMap;
  skillLevelCache ??= readSkillLevelCsv();
  skillLevelMap = new Map();
  for (const row of skillLevelCache) {
    const key = `${row.技能範圍}:${row.技能名稱}`;
    const rows = skillLevelMap.get(key) ?? [];
    rows.push(row);
    skillLevelMap.set(key, rows);
  }
  return skillLevelMap;
}

function findSkillForToken(token: string, rows: SkillRecord[]): SkillRecord | undefined {
  return rows.find((row) => skillMatchesPage(token, row.技能名稱));
}

const characterCategoryKeys: Record<string, string> = {
  戰鬥攻擊技能: 'atk_phys',
  戰鬥防禦技能: 'def_phys',
  戰鬥輔助技能: 'sup_phys',
  屬性攻擊魔法: 'atk_magic',
  狀態變化魔法: 'status_magic',
  戰鬥輔助魔法: 'sup_magic',
  其他特殊技能: 'other_skill',
  生產製作技能: 'craft_skill',
};

const characterCategoryLabelsByKey: Record<string, string> = Object.fromEntries(
  Object.entries(characterCategoryKeys).map(([label, key]) => [key, label]),
);

const petCategoryLabels: Record<string, string> = {
  pet_general: '寵物一般技能',
  pet_combat: '寵物戰鬥技能',
  pet_magic: '寵物魔法技能',
  pet_status_atk: '狀態攻擊技能',
  pet_status_magic: '寵物狀態變化魔法',
  pet_status_def: '狀態抵抗技能',
  pet_other: '其他寵物技能',
};

const petCategoryKeysByLabel: Record<string, string> = Object.fromEntries(
  Object.entries(petCategoryLabels).map(([key, label]) => [label, key]),
);

function characterCategoryKey(category: string): string {
  return characterCategoryKeys[category.trim()] ?? 'other_skill';
}

function characterDisplayCategory(category: string): string {
  const normalized = category.trim();
  return characterCategoryKeys[normalized]
    ? normalized
    : characterCategoryLabelsByKey[normalized] ?? normalized;
}

function petCategoryKey(category: string): string {
  const normalized = category.trim();
  if (petCategoryLabels[normalized]) return normalized;
  if (petCategoryKeysByLabel[normalized]) return petCategoryKeysByLabel[normalized];
  if (normalized === '狀態變化魔法') return 'pet_status_magic';
  if (normalized === '屬性攻擊魔法' || normalized === '戰鬥輔助魔法') return 'pet_magic';
  if (normalized === '其他特殊技能') return 'pet_general';
  return 'pet_other';
}

export function petDisplayCategory(category: string): string {
  return petCategoryLabels[petCategoryKey(category)] ?? '其他寵物技能';
}

/** 技能資料進入正式資料流時，寵物分類一律保存為技能總覽使用的中文。 */
function normalizeSkillRecord(record: SkillRecord): SkillRecord {
  const 技能分類 = record.技能範圍 === 'pet'
    ? petDisplayCategory(record.技能分類)
    : characterDisplayCategory(record.技能分類);
  return { ...record, 技能分類 };
}

function normalizeSkillLevelData(record: SkillLevelData): SkillLevelData {
  const 技能分類 = record.技能範圍 === 'pet'
    ? petDisplayCategory(record.技能分類)
    : characterDisplayCategory(record.技能分類);
  return { ...record, 技能分類 };
}

function holderLevels(skill: SkillRecord, holders: PetSkillHolder[]): number[] {
  const levels = new Set<number>();
  for (const holder of holders) {
    if (holder.level != null) levels.add(holder.level);
  }
  const declaredMax = skill.最高等級.match(/^LV (\d+)$/)?.[1];
  if (declaredMax) {
    const max = Number(declaredMax);
    return Array.from({ length: max }, (_, index) => index + 1);
  }
  return [...levels].sort((a, b) => a - b);
}

export function skillLevelRows(
  skill: SkillRecord,
  holders = listPetsWithSkill(skill.技能名稱),
  scope: SkillScope = 'character',
): SkillLevelRow[] {
  const specialLevelHolders = holders.filter((holder) =>
    isSkillSpVariantLabel(holder.skillLabel),
  );
  const rankedHolders = holders.filter((holder) => !isSkillSpVariantLabel(holder.skillLabel));
  const sourceRows = getSkillLevelMap().get(`${scope === 'character' ? 'char' : 'pet'}:${skill.技能名稱}`)
    ?? (scope === 'pet' ? getSkillLevelMap().get(`char:${skill.技能名稱}`) : undefined)
    ?? (scope === 'character' ? getSkillLevelMap().get(`pet:${skill.技能名稱}`) : undefined);

  /** 等級表列：LV n；無等級的寵物一般技能也保留原列。 */
  const lvSourceRows = (sourceRows ?? []).filter((row) =>
    /^LV\s*\d+$/i.test((row.技能等級 || '').trim()),
  );
  const nonLevelSourceRows = (sourceRows ?? []).filter((row) => {
    const label = (row.技能等級 || '').trim();
    return label && !/^LV\s*\d+$/i.test(label) && !/^SP\d*$/i.test(label);
  });
  /** SP 效果：技能等級.csv 的 SP / SP1 / SP2 列 */
  const spSourceByLabel = new Map<string, SkillLevelData>();
  for (const row of sourceRows ?? []) {
    const lab = (row.技能等級 || '').trim().toUpperCase();
    if (/^SP\d*$/.test(lab)) {
      spSourceByLabel.set(lab === 'SP' ? 'SP' : lab, row);
    }
  }

  const rows: SkillLevelRow[] = [
    ...lvSourceRows.map((row) => {
      const level = row.技能等級.match(/^LV\s*(\d+)$/i)?.[1];
      const parsedLevel = level ? Number(level) : null;
      const detail = (row.技能效果詳細說明 || '').trim();
      return {
        level: parsedLevel,
        label: row.技能等級.replace(/^LV\s*/i, 'LV ').trim(),
        mp: (row.魔力消耗 || '').trim() || '—',
        description: detail || '—',
        learningInfo: (row.學習資訊 || '').trim() || '—',
        holders:
          parsedLevel == null
            ? rankedHolders
            : rankedHolders.filter((holder) => holder.level === parsedLevel),
      };
    }),
    ...nonLevelSourceRows.map((row) => ({
      level: null,
      label: (row.技能等級 || '').trim() || skill.技能名稱,
      mp: (row.魔力消耗 || '').trim() || '—',
      description: (row.技能效果詳細說明 || '').trim() || '—',
      learningInfo: (row.學習資訊 || '').trim() || '—',
      holders: rankedHolders,
    })),
  ];

  if (!lvSourceRows.length && !nonLevelSourceRows.length) {
    const levels = holderLevels(skill, rankedHolders);
    if (levels.length === 0 && specialLevelHolders.length === 0) {
      return [{
        level: null,
        label: '未標示等級',
        mp: '—',
        description: '—',
        learningInfo: '—',
        holders,
      }];
    }
    for (const level of levels) {
      rows.push({
        level,
        label: `LV ${level}`,
        mp: '—',
        description: '—',
        learningInfo: '—',
        holders: rankedHolders.filter((holder) => holder.level === level),
      });
    }
  }

  // SP / SP1 / SP2 分開一列；效果與學習資訊只取技能等級表的結構化列。
  rows.push(...buildSpLevelRows(specialLevelHolders, spSourceByLabel));
  return rows;
}

/**
 * 依持有者 skillLabel 的 SP／SP1／SP2 分列。
 * SP 效果與學習資訊必須來自技能等級.csv 的同標籤列。
 */
function buildSpLevelRows(
  specialHolders: PetSkillHolder[],
  spSourceByLabel: Map<string, SkillLevelData>,
): SkillLevelRow[] {
  if (!specialHolders.length) return [];

  const byLabel = new Map<string, PetSkillHolder[]>();
  for (const h of specialHolders) {
    const lab = skillSpLabel(h.skillLabel) ?? 'SP';
    const list = byLabel.get(lab) ?? [];
    list.push(h);
    byLabel.set(lab, list);
  }

  const order = [...byLabel.keys()].sort((a, b) => {
    if (a === 'SP') return -1;
    if (b === 'SP') return 1;
    const na = Number(a.replace(/\D/g, '') || 0);
    const nb = Number(b.replace(/\D/g, '') || 0);
    return na - nb || a.localeCompare(b);
  });

  return order.map((lab) => {
    const src = spSourceByLabel.get(lab) ?? spSourceByLabel.get('SP');
    const fromCsv = (src?.技能效果詳細說明 || '').trim();
    const description = fromCsv || '—';
    const mp = (src?.魔力消耗 || '').trim() || '—';
    const learningInfo = (src?.學習資訊 || '').trim() || '—';
    return {
      level: null,
      label: lab,
      mp,
      description,
      learningInfo,
      holders: byLabel.get(lab) ?? [],
    };
  });
}

/**
 * 學習資訊顯示：
 * 1. 技能庫「學習資訊」（摘要／人物技能頁）
 * 2. 否則合併各等級「學習資訊」（寵物技能店等）
 */
export function skillLearningInfo(
  levels: SkillLevelRow[],
  skill?: SkillRecord | null,
): string {
  const fromLib = (skill?.學習資訊 || '').trim();
  if (fromLib) return fromLib;

  const parts: string[] = [];
  const seen = new Set<string>();
  for (const row of levels) {
    const t = (row.learningInfo || '').trim();
    if (!t || t === '—') continue;
    if (seen.has(t)) continue;
    seen.add(t);
    parts.push(t);
  }
  return parts.length ? parts.join('；') : '—';
}

export function listPetSkills(): Array<{ skill: SkillRecord; holders: PetSkillHolder[] }> {
  return listSkills()
    .filter((skill) => skill.技能範圍 === 'pet')
    .map((skill) => ({ skill, holders: listPetsWithSkill(skill.技能名稱) }));
}

export function listSkillNames(): string[] {
  return listSkillPages().map((skill) => skill.技能名稱);
}

export function listSkillPages(): SkillRecord[] {
  return listSkills().filter((skill) => skill.技能範圍 === 'char');
}

export function getSkill(name: string): SkillRecord | undefined {
  const decoded = decodeURIComponent(name);
  return listSkillPages().find((skill) => skill.技能名稱 === decoded);
}

function variant(scope: SkillScope, skill: SkillRecord, holders: PetSkillHolder[]): SkillVariant {
  const categoryKey = scope === 'pet'
    ? petCategoryKey(skill.技能分類)
    : characterCategoryKey(skill.技能分類);
  return {
    skill,
    scope,
    category: skill.技能分類,
    categoryKey,
    holders,
    levels: skillLevelRows(skill, holders, scope),
  };
}

/** 技能列表排序：先字數短→長，同字數再按筆畫／音序 */
function sortSkillsByNameLength(skills: SkillRecord[]): SkillRecord[] {
  return [...skills].sort((a, b) => {
    const na = (a.技能名稱 || '').length;
    const nb = (b.技能名稱 || '').length;
    if (na !== nb) return na - nb;
    return a.技能名稱.localeCompare(b.技能名稱, 'zh-Hant');
  });
}

export function listSkillVariants(): SkillVariant[] {
  const character = sortSkillsByNameLength(
    listSkills().filter((skill) => skill.技能範圍 === 'char'),
  ).map((skill) => variant('character', skill, listPetsWithSkill(skill.技能名稱)));
  const pet = sortSkillsByNameLength(
    listSkills().filter((skill) => skill.技能範圍 === 'pet'),
  ).map((skill) => variant('pet', skill, listPetsWithSkill(skill.技能名稱)));
  return [...character, ...pet];
}

export function skillHolders(skill: SkillRecord): PetSkillHolder[] {
  return listPetsWithSkill(skill.技能名稱);
}

function issuesForToken(rawToken: string, petName: string, rows: SkillRecord[]): SkillParseIssue[] {
  const issues: SkillParseIssue[] = [];
  if (!findSkillForToken(rawToken, rows)) {
    issues.push({ petName, raw: rawToken, reason: '技能未收錄於技能庫' });
  }
  // SP 變體（突襲之舞SP 等）無 LV 屬正常
  if (!parseSkillLevel(rawToken) && !isSkillSpVariantLabel(rawToken)) {
    issues.push({ petName, raw: rawToken, reason: '技能原文沒有 LV 等級' });
  }
  return issues;
}

export function listSkillParseIssues(): SkillParseIssue[] {
  const rows = listSkills();
  const issues: SkillParseIssue[] = [];
  for (const pet of listPets()) {
    for (const rawToken of splitSkills(pet.技能)) {
      issues.push(...issuesForToken(rawToken, pet.名稱, rows));
    }
  }
  return issues;
}
