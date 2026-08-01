/**
 * 寵物合成活動：
 * - 配方 CSV 的 parse 僅供 fusion:build（adapters/csv + 活動索引）
 * - 寵物頁相關活動：只讀 fusion-library.json
 * - 活動總表 UI：仍用 loadDataset('寵物合成配方')（與合成樹無關）
 *
 * 舊 runtime 展樹（buildFusionTreeForPet 等）已刪；請用 src/lib/fusion/query。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type { FusionNode } from './pets';
import { getItem, itemImagePath } from './items';
import { loadFusionLibraryFile } from './fusion/library';
import { normalizePetName } from './fusion/names';

export interface SynthesisRecipe {
  活動日期: string;
  公告日: string;
  '活動／期別': string;
  NPC: string;
  所需寵物: string;
  所需道具: string;
  獲得寵物: string;
  合成樹: string;
  入手方法: string;
  公告連結: string;
}

export interface SynthesisActivityMeta {
  id: string;
  title: string;
  period: string;
  announcementDate: string;
  url: string;
  year: string;
}

/** 配方右側的一個產物分支（寵物或道具，可含機率） */
export interface ProductOutcome {
  type: 'pet' | 'item';
  name: string;
  qty?: number;
  /** 正規化後如 "2%" */
  prob?: string;
}

/** 一條配方解析後的結構化結果（供 fusion:build adapter 使用） */
export interface ParsedRecipe {
  raw: SynthesisRecipe;
  activityId: string;
  /** 材料節點（寵物 / 道具 / 金幣） */
  ingredients: FusionNode[];
  /** 產物寵物名稱（已對表；召喚書會去尾） */
  productPets: string[];
  productLabels: string[];
  productProb: Record<string, string>;
  outcomes: ProductOutcome[];
  npc: string;
}

let recipeCache: ParsedRecipe[] | null = null;
let recipeMtime = 0;

let petNamesLongest: string[] | null = null;
let petImageByName: Map<string, string> | null = null;
let petTableMtime = 0;

const GOLD_RE = /金幣|^\d{1,3}(?:,\d{3})+G$|\d+G$/;
const QTY_RE = /[×*xX]\s*(\d+)\s*$/;
const PROB_RE = /[（(]\s*概率\s*[^）)]*[）)]|概率\s*\d+(?:\.\d+)?\s*%?/g;
/**
 * 材料／產物等級前綴。
 * 注意：`Lv40以上的新生賽格梅特` 必須一次吃掉「Lv40以上的」，
 * 不可只吃 `Lv40` 留下「以上的…」被當道具。
 */
const LV_PREFIX_RE =
  /^(?:任意等級以上的?|任意等級的+|等級以上的?|以上的?|(?:Lv|LV|lv)\.?\s*\d+\s*(?:以上的?|的?)|(?:Lv|LV|lv)\.?\s*的?)\s*/u;

/** 反覆剝等級前綴與多餘「的」（最多數次，避免殘字） */
function stripLevelPrefix(s: string): string {
  let t = (s ?? '').trim();
  for (let i = 0; i < 6; i++) {
    const next = t.replace(LV_PREFIX_RE, '').replace(/^的+/u, '').trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

/**
 * 從公告字串取出等級標註（剝名前呼叫）。
 * Spec：
 * - 任意等級… → anyLevel（顯示 任意@）
 * - 有寫 LvN／LvN以上… → minLevel=N（顯示 {N}等@）
 * - 沒寫等級 → 不標
 */
export function extractLevelRequirement(token: string): {
  minLevel?: number;
  anyLevel?: boolean;
} {
  const t = (token ?? '').trim();
  if (!t) return {};
  if (/^任意等級/u.test(t)) return { anyLevel: true };
  const mLv = t.match(/^(?:Lv|LV|lv)\.?\s*(\d+)/u);
  if (mLv) return { minLevel: Number(mLv[1]) };
  return {};
}

function extractProb(s: string): { clean: string; prob?: string } {
  let clean = s;
  let prob: string | undefined;
  const mParen = clean.match(/[（(]\s*概率\s*(\d+(?:\.\d+)?)\s*%?\s*[）)]/);
  if (mParen) {
    prob = `${mParen[1]}%`;
    clean = clean.replace(mParen[0], '');
  } else {
    const mBare = clean.match(/概率\s*(\d+(?:\.\d+)?)\s*%?/);
    if (mBare) {
      prob = `${mBare[1]}%`;
      clean = clean.replace(mBare[0], '');
    }
  }
  clean = clean.replace(/\s+/g, ' ').trim();
  return prob ? { clean, prob } : { clean };
}

/** 活動錨點 id：穩定、短、URL 安全 */
export function synthesisActivityId(
  announcementDate: string,
  title: string,
  period = '',
): string {
  const key = `${announcementDate.trim()}|${period.trim()}|${title.trim()}`;
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 10);
  const date = (announcementDate.trim() || 'unknown').replace(/[^\d-]/g, '') || 'unknown';
  return `act-${date}-${hash}`;
}

export function synthesisActivityHref(activityId: string, base = ''): string {
  const b = base.replace(/\/$/, '');
  return `${b}/寵物合成活動#${activityId}`;
}

function announcementUrl(md: string): string {
  return md.match(/\]\((https?:\/\/[^)]+)\)/)?.[1] ?? '';
}

function loadPetTable(): void {
  const files = [
    { path: join(process.cwd(), 'content', 'data', '專屬寵物.csv'), kind: 'exclusive' as const },
    { path: join(process.cwd(), 'content', 'data', '原生寵物.csv'), kind: 'native' as const },
  ];
  let mtime = 0;
  for (const f of files) {
    if (existsSync(f.path)) mtime = Math.max(mtime, statSync(f.path).mtimeMs);
  }
  if (petNamesLongest && mtime === petTableMtime) return;
  petTableMtime = mtime;
  petImageByName = new Map();
  const names: string[] = [];
  const seen = new Set<string>();
  // 專屬先載：同名以專屬為準（圖／名稱表）
  for (const f of files) {
    if (!existsSync(f.path)) continue;
    const text = readFileSync(f.path, 'utf8').replace(/^\uFEFF/, '');
    const rows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as Array<Record<string, string>>;
    for (const row of rows) {
      const n = (row['名稱'] ?? '').trim();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      names.push(n);
      const img = (row['image'] ?? '').trim();
      const fallback =
        f.kind === 'native' ? `/img/原生寵物/${n}.gif` : `/img/專屬寵物/${n}.gif`;
      petImageByName.set(n, img || fallback);
    }
  }
  petNamesLongest = names.sort(
    (a, b) => b.length - a.length || a.localeCompare(b, 'zh-Hant'),
  );
}

function ssotImage(name: string): string {
  loadPetTable();
  return petImageByName?.get(name) || `/img/專屬寵物/${name}.gif`;
}

function matchExactPetToken(token: string): string | null {
  loadPetTable();
  if (!token?.trim() || !petNamesLongest?.length) return null;
  let t = stripLevelPrefix(token.replace(PROB_RE, ''))
    .replace(QTY_RE, '')
    .replace(/\s+/g, '')
    .trim();
  if (!t) return null;
  if (t.endsWith('召喚書')) t = t.slice(0, -3);
  t = stripLevelPrefix(t);
  for (const name of petNamesLongest) {
    if (name.replace(/\s+/g, '') === t) return name;
  }
  return null;
}

function findPetNamesInText(text: string): string[] {
  loadPetTable();
  if (!text?.trim() || !petNamesLongest?.length) return [];
  let clean = stripLevelPrefix(
    text.replace(PROB_RE, ' ').replace(/召喚書/g, ' '),
  );
  clean = clean.replace(/\s+/g, '');
  const used = new Array(clean.length).fill(false);
  const found: string[] = [];
  for (const name of petNamesLongest) {
    const key = name.replace(/\s+/g, '');
    if (key.length < 1) continue;
    let start = 0;
    while (start < clean.length) {
      const i = clean.indexOf(key, start);
      if (i < 0) break;
      if (used.slice(i, i + key.length).some(Boolean)) {
        start = i + 1;
        continue;
      }
      for (let j = i; j < i + key.length; j++) used[j] = true;
      found.push(name);
      start = i + key.length;
    }
  }
  return found;
}

function petFromProductLabel(lab: string): string | null {
  const { clean } = extractProb(lab);
  const stripped = stripLevelPrefix(clean)
    .replace(/\s+/g, '')
    .replace(/召喚書$/u, '')
    .trim();
  const stripped2 = stripLevelPrefix(stripped);
  if (!stripped2) return null;
  loadPetTable();
  for (const name of petNamesLongest ?? []) {
    if (name.replace(/\s+/g, '') === stripped2) return name;
  }
  const hits = findPetNamesInText(lab);
  return hits[0] ?? null;
}

function stripProb(s: string): string {
  return extractProb(s).clean;
}

function parseQty(token: string): { name: string; qty?: number } {
  const m = token.match(QTY_RE);
  if (!m) return { name: token.trim() };
  return {
    name: token.slice(0, m.index).trim(),
    qty: Number(m[1]),
  };
}

function ingredientNode(token: string): FusionNode {
  const raw = token.trim();
  if (!raw) return { type: 'material', name: raw };

  if (GOLD_RE.test(raw) || /金幣/.test(raw)) {
    const num = raw.match(/([\d,]+)\s*G/)?.[1] ?? raw.replace(/[^\d,]/g, '');
    return {
      type: 'gold',
      name: num ? `${num} G` : raw,
      countLabel: '金幣',
    };
  }

  const levelReq = extractLevelRequirement(raw);
  const exact = matchExactPetToken(raw);
  if (exact) {
    return {
      type: 'pet',
      name: exact,
      image: ssotImage(exact),
      ...(levelReq.minLevel != null ? { minLevel: levelReq.minLevel } : {}),
      ...(levelReq.anyLevel ? { anyLevel: true } : {}),
    };
  }

  const { name, qty } = parseQty(stripLevelPrefix(raw));
  const itemName = name || raw;
  const fromLib = getItem(itemName);
  const image = itemImagePath(itemName);
  return {
    type: 'item',
    name: fromLib?.名稱 ?? itemName,
    ...(image ? { image } : {}),
    ...(qty != null ? { qty } : {}),
  };
}

function splitLeftIngredients(left: string): string[] {
  return left
    .split(/\s*＋\s*|\s*\+\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitRightProducts(right: string): string[] {
  let r = right.trim();
  r = r
    .replace(/\/\s*├/g, '｜')
    .replace(/\/\s*└/g, '｜')
    .replace(/[├└]/g, '｜')
    .replace(/^\s*\/\s*/, '');
  const parts = r
    .split(/\s*｜\s*/)
    .map((s) => s.trim())
    .filter((s) => s && s !== '/');
  if (parts.length > 1) return parts;
  if ((right.match(/概率/g) ?? []).length >= 2) {
    const alt = right
      .split(/(?=\S[^概率]*概率)/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (alt.length > 1) return alt;
  }
  return parts.length ? parts : right ? [right.trim()] : [];
}

function parseRecipe(raw: SynthesisRecipe): ParsedRecipe {
  const tree = raw['合成樹'] || '';
  let left = '';
  let right = '';
  if (tree.includes('＝')) {
    const i = tree.indexOf('＝');
    left = tree.slice(0, i);
    right = tree.slice(i + 1);
  } else if (tree.includes('=')) {
    const i = tree.indexOf('=');
    left = tree.slice(0, i);
    right = tree.slice(i + 1);
  } else {
    left = raw['所需寵物'] + (raw['所需道具'] ? ` ＋ ${raw['所需道具']}` : '');
    right = raw['獲得寵物'];
  }

  const matTokens = splitLeftIngredients(left);
  const ingredients: FusionNode[] = [];
  if (matTokens.length > 0) {
    for (const tok of matTokens) {
      if (/或/.test(tok)) {
        const pets = findPetNamesInText(tok);
        if (pets.length) {
          for (const n of pets) {
            ingredients.push({ type: 'pet', name: n, image: ssotImage(n) });
          }
          continue;
        }
      }
      ingredients.push(ingredientNode(tok));
    }
  } else {
    for (const n of findPetNamesInText(raw['所需寵物'])) {
      ingredients.push({ type: 'pet', name: n, image: ssotImage(n) });
    }
  }

  const productLabels = splitRightProducts(right);
  const labels =
    productLabels.length > 0 ? productLabels : [raw['獲得寵物']].filter(Boolean);

  const productPets: string[] = [];
  const productProb: Record<string, string> = {};
  const outcomes: ProductOutcome[] = [];
  const seen = new Set<string>();

  const pushPetOutcome = (n: string, prob?: string) => {
    if (!seen.has(n)) {
      seen.add(n);
      productPets.push(n);
      outcomes.push({ type: 'pet', name: n, ...(prob ? { prob } : {}) });
    } else if (prob && !productProb[n]) {
      const hit = outcomes.find((o) => o.type === 'pet' && o.name === n);
      if (hit && !hit.prob) hit.prob = prob;
    }
    if (prob && !productProb[n]) productProb[n] = prob;
  };

  for (const lab of labels) {
    const { clean, prob } = extractProb(lab);
    const asPet = petFromProductLabel(lab);
    if (asPet) {
      pushPetOutcome(asPet, prob);
      for (const n of findPetNamesInText(lab)) {
        if (n !== asPet) pushPetOutcome(n, prob);
      }
      continue;
    }
    const { name, qty } = parseQty(stripLevelPrefix(clean));
    let itemName = (name || clean).trim();
    if (/召喚書/.test(itemName)) {
      const fallback = petFromProductLabel(itemName);
      if (fallback) {
        pushPetOutcome(fallback, prob);
        continue;
      }
      itemName = itemName.replace(/召喚書/g, '').trim();
    }
    if (!itemName) continue;
    const fromLib = getItem(itemName);
    outcomes.push({
      type: 'item',
      name: fromLib?.名稱 ?? itemName,
      ...(qty != null ? { qty } : {}),
      ...(prob ? { prob } : {}),
    });
  }
  if (productPets.length === 0 && outcomes.length === 0) {
    const { prob } = extractProb(raw['獲得寵物'] || '');
    for (const n of findPetNamesInText(raw['獲得寵物'])) {
      pushPetOutcome(n, prob);
    }
  }

  return {
    raw,
    activityId: synthesisActivityId(raw['公告日'], raw['活動／期別'], raw['活動日期']),
    ingredients,
    productPets,
    productLabels: labels.map(stripProb),
    productProb,
    outcomes,
    npc: (raw.NPC || '').trim(),
  };
}

function loadRawRecipes(): SynthesisRecipe[] {
  const file = join(process.cwd(), 'content', 'data', '寵物合成配方.csv');
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as SynthesisRecipe[];
}

function ensureParsed(): ParsedRecipe[] {
  const file = join(process.cwd(), 'content', 'data', '寵物合成配方.csv');
  const mtime = existsSync(file) ? statSync(file).mtimeMs : 0;
  if (recipeCache && mtime === recipeMtime) return recipeCache;

  loadPetTable();
  recipeCache = loadRawRecipes().map(parseRecipe);
  recipeMtime = mtime;
  return recipeCache;
}

/** 供 fusion:build 使用（parse 配方 CSV） */
export function listSynthesisRecipes(): ParsedRecipe[] {
  return ensureParsed();
}

export function getActivityMeta(rec: ParsedRecipe): SynthesisActivityMeta {
  const r = rec.raw;
  return {
    id: rec.activityId,
    title: r['活動／期別'],
    period: r['活動日期'],
    announcementDate: r['公告日'],
    url: announcementUrl(r['公告連結'] ?? ''),
    year: (r['公告日'] || '').slice(0, 4) || '其他',
  };
}

/**
 * 去重後的活動列表（材料或產物有出現此寵）。
 * 只讀 fusion-library.json。
 */
export function listActivitiesForPet(petName: string): SynthesisActivityMeta[] {
  const key = normalizePetName(petName) || petName;
  const lib = loadFusionLibraryFile();
  const list = lib.activitiesByPet?.[key] ?? lib.activitiesByPet?.[petName] ?? [];
  return list.map((a) => ({ ...a }));
}
