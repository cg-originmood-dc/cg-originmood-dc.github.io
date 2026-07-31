import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import {
  listPets,
  listPetsWithSkill,
  parseSkillLevel,
  skillMatchesPage,
  splitSkills,
  type PetSkillHolder,
} from './pets';

export interface SkillRecord {
  技能名稱: string;
  分類: string;
  技能來源: string;
  最高等級: string;
  簡介: string;
  技能範圍: 'char' | 'pet';
}

export type SkillScope = 'character' | 'pet';

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
  return parse(source, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as SkillRecord[];
}

export function listSkills(): SkillRecord[] {
  return (skillCache ??= readSkillCsv());
}

function readSkillLevelCsv(): SkillLevelData[] {
  const source = readFileSync(skillLevelCsvPath, 'utf8').replace(/^\uFEFF/, '');
  return parse(source, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as SkillLevelData[];
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

const petCategoryLabels: Record<string, string> = {
  pet_general: '寵物一般技能',
  pet_combat: '寵物戰鬥技能',
  pet_magic: '寵物魔法技能',
  pet_status_atk: '狀態攻擊技能',
  pet_status_magic: '寵物狀態變化魔法',
  pet_status_def: '狀態抵抗技能',
  pet_other: '其他寵物技能',
};

function characterCategoryKey(category: string): string {
  return characterCategoryKeys[category] ?? 'other_skill';
}

function petCategoryKey(category: string): string {
  if (petCategoryLabels[category]) return category;
  if (category === '狀態變化魔法') return 'pet_status_magic';
  if (category === '屬性攻擊魔法' || category === '戰鬥輔助魔法') return 'pet_magic';
  if (category === '其他特殊技能') return 'pet_general';
  return 'pet_other';
}

function petDisplayCategory(category: string): string {
  return petCategoryLabels[petCategoryKey(category)] ?? '其他寵物技能';
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
  const specialLevelHolders = holders.filter((holder) => holder.skillLabel.endsWith('SP'));
  const sourceRows = getSkillLevelMap().get(`${scope === 'character' ? 'char' : 'pet'}:${skill.技能名稱}`)
    ?? (scope === 'pet' ? getSkillLevelMap().get(`char:${skill.技能名稱}`) : undefined);
  if (sourceRows?.length) {
    const rows = sourceRows.map((row) => {
      const level = row.技能等級.match(/^LV (\d+)$/)?.[1];
      const parsedLevel = level ? Number(level) : null;
      return {
        level: parsedLevel,
        label: row.技能等級,
        mp: row.魔力消耗 || '—',
        description: row.技能效果詳細說明 || '—',
        learningInfo: row.學習資訊 || '—',
        holders: parsedLevel == null ? holders : holders.filter((holder) => holder.level === parsedLevel),
      };
    });
    if (specialLevelHolders.length > 0) {
      rows.push({
        level: null,
        label: 'SP',
        mp: '—',
        description: skill.簡介 || '—',
        learningInfo: '—',
        holders: specialLevelHolders,
      });
    }
    return rows;
  }

  const levels = holderLevels(skill, holders);
  if (levels.length === 0) {
    return [{
      level: null,
      label: specialLevelHolders.length > 0 ? 'SP' : '未標示等級',
      mp: '未提供',
      description: skill.簡介 || '—',
      learningInfo: '—',
      holders: specialLevelHolders.length > 0 ? specialLevelHolders : holders,
    }];
  }
  return levels.map((level) => ({
    level,
    label: `LV ${level}`,
    mp: '未提供',
    description: skill.簡介 || '—',
    learningInfo: '—',
    holders: holders.filter((holder) => holder.level === level),
  }));
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
  const categoryKey = scope === 'pet' ? petCategoryKey(skill.分類) : characterCategoryKey(skill.分類);
  return {
    skill,
    scope,
    category: scope === 'pet' ? petDisplayCategory(skill.分類) : skill.分類,
    categoryKey,
    holders,
    levels: skillLevelRows(skill, holders, scope),
  };
}

export function listSkillVariants(): SkillVariant[] {
  const character = listSkills()
    .filter((skill) => skill.技能範圍 === 'char')
    .map((skill) => variant('character', skill, listPetsWithSkill(skill.技能名稱)));
  const pet = listPetSkills().map(({ skill, holders }) => variant('pet', skill, holders));
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
  if (!parseSkillLevel(rawToken) && !rawToken.endsWith('SP')) {
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
