/**
 * 寵物合成活動 → 合成樹 / 活動錨點
 *
 * SSOT：content/data/寵物合成配方.csv
 * - 每列一條配方（材料 → 產物，可能多產物機率）
 * - 自動把「產物寵物」掛到對應寵物詳情的合成樹
 * - 活動列可用 #act-… 錨點從寵物頁跳回
 *
 * 注意：本檔不 runtime import pets.ts，避免與 resolveFusionTree 循環依賴。
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type { FusionNode, ObtainMethod } from './pets';
import { getItem, itemImagePath } from './items';

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

/** 一條配方解析後的結構化結果 */
export interface ParsedRecipe {
  raw: SynthesisRecipe;
  activityId: string;
  /** 材料節點（寵物 / 道具 / 金幣），尚未遞迴展開 */
  ingredients: FusionNode[];
  /** 產物寵物名稱（已對到專屬寵物表；召喚書會去尾） */
  productPets: string[];
  /** 產物文字（含機率清理後） */
  productLabels: string[];
  npc: string;
}

let recipeCache: ParsedRecipe[] | null = null;
let recipeMtime = 0;
let byProduct: Map<string, ParsedRecipe[]> | null = null;
let petMention: Set<string> | null = null;

let petNamesLongest: string[] | null = null;
let petImageByName: Map<string, string> | null = null;
let petTableMtime = 0;

const GOLD_RE = /金幣|^\d{1,3}(?:,\d{3})+G$|\d+G$/;
const QTY_RE = /[×*xX]\s*(\d+)\s*$/;
const PROB_RE = /[（(]\s*概率\s*[^）)]*[）)]|概率\s*\d+%/g;
const LV_PREFIX_RE = /^(?:任意等級的|Lv\s*\d+\s*的|LV\s*\d+\s*的|lv\s*\d+\s*的)\s*/i;

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
  const file = join(process.cwd(), 'content', 'data', '專屬寵物.csv');
  const mtime = existsSync(file) ? statSync(file).mtimeMs : 0;
  if (petNamesLongest && mtime === petTableMtime) return;
  petTableMtime = mtime;
  petImageByName = new Map();
  if (!existsSync(file)) {
    petNamesLongest = [];
    return;
  }
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Array<Record<string, string>>;
  const names: string[] = [];
  for (const row of rows) {
    const n = (row['名稱'] ?? '').trim();
    if (!n) continue;
    names.push(n);
    const img = (row['image'] ?? '').trim();
    petImageByName.set(n, img || `/img/專屬寵物/${n}.gif`);
  }
  petNamesLongest = names.sort(
    (a, b) => b.length - a.length || a.localeCompare(b, 'zh-Hant'),
  );
}

function ssotImage(name: string): string {
  loadPetTable();
  return petImageByName?.get(name) || `/img/專屬寵物/${name}.gif`;
}

/** 正規化後是否整段等於某寵物名（材料欄用，避免「神樂之聖角」誤判成「神樂」） */
function matchExactPetToken(token: string): string | null {
  loadPetTable();
  if (!token?.trim() || !petNamesLongest?.length) return null;
  let t = token
    .replace(PROB_RE, '')
    .replace(LV_PREFIX_RE, '')
    .replace(QTY_RE, '')
    .replace(/\s+/g, '')
    .trim();
  if (!t) return null;
  // 召喚書 → 對應寵物
  if (t.endsWith('召喚書')) t = t.slice(0, -3);
  for (const name of petNamesLongest) {
    if (name.replace(/\s+/g, '') === t) return name;
  }
  return null;
}

/**
 * 在一段文字裡找專屬寵物名（最長優先、不重疊）。
 * 用於「獲得寵物」等多名混寫欄；材料請用 matchExactPetToken。
 */
export function findPetNamesInText(text: string): string[] {
  loadPetTable();
  if (!text?.trim() || !petNamesLongest?.length) return [];
  let clean = text
    .replace(PROB_RE, ' ')
    .replace(/召喚書/g, ' ')
    .replace(LV_PREFIX_RE, '');
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

function stripProb(s: string): string {
  return s.replace(PROB_RE, '').replace(/\s+/g, ' ').trim();
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

  // 材料：只接受「整段就是寵物名」（含 Lv1的／任意等級的 前綴）
  const exact = matchExactPetToken(raw);
  if (exact) {
    return {
      type: 'pet',
      name: exact,
      image: ssotImage(exact),
    };
  }

  const { name, qty } = parseQty(raw.replace(LV_PREFIX_RE, ''));
  const itemName = name || raw;
  // 道具圖從道具庫引用；無圖不塞 emoji，留給 UI 顯示分類文字
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
  const ingredients =
    matTokens.length > 0
      ? matTokens.map(ingredientNode)
      : findPetNamesInText(raw['所需寵物']).map(
          (n): FusionNode => ({ type: 'pet', name: n, image: ssotImage(n) }),
        );

  const productLabels = splitRightProducts(right);
  const labels =
    productLabels.length > 0 ? productLabels : [raw['獲得寵物']].filter(Boolean);

  const productPets: string[] = [];
  const seen = new Set<string>();
  for (const lab of labels) {
    for (const n of findPetNamesInText(lab)) {
      if (!seen.has(n)) {
        seen.add(n);
        productPets.push(n);
      }
    }
  }
  if (productPets.length === 0) {
    for (const n of findPetNamesInText(raw['獲得寵物'])) {
      if (!seen.has(n)) {
        seen.add(n);
        productPets.push(n);
      }
    }
  }

  return {
    raw,
    activityId: synthesisActivityId(raw['公告日'], raw['活動／期別'], raw['活動日期']),
    ingredients,
    productPets,
    productLabels: labels.map(stripProb),
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
  if (recipeCache && mtime === recipeMtime && byProduct) return recipeCache;

  loadPetTable();
  const raws = loadRawRecipes();
  recipeCache = raws.map(parseRecipe);
  recipeMtime = mtime;

  byProduct = new Map();
  petMention = new Set();
  for (const rec of recipeCache) {
    for (const ing of rec.ingredients) {
      if (ing.type === 'pet') petMention.add(ing.name);
    }
    for (const p of rec.productPets) {
      petMention.add(p);
      // 跳過「材料寵物只有自己 → 產物自己」的空轉列
      const petIng = rec.ingredients.filter((i) => i.type === 'pet');
      const selfOnly =
        rec.productPets.length === 1 &&
        petIng.length > 0 &&
        petIng.every((i) => i.name === p);
      if (selfOnly) continue;
      const list = byProduct.get(p) ?? [];
      list.push(rec);
      byProduct.set(p, list);
    }
  }
  return recipeCache;
}

export function listSynthesisRecipes(): ParsedRecipe[] {
  return ensureParsed();
}

export function listRecipesForProduct(petName: string): ParsedRecipe[] {
  ensureParsed();
  return byProduct?.get(petName) ?? [];
}

export function petAppearsInSynthesis(petName: string): boolean {
  ensureParsed();
  return petMention?.has(petName) ?? false;
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

/** 去重後的活動列表（材料或產物有出現此寵） */
export function listActivitiesForPet(petName: string): SynthesisActivityMeta[] {
  ensureParsed();
  const map = new Map<string, SynthesisActivityMeta>();
  for (const rec of recipeCache ?? []) {
    const hit =
      rec.productPets.includes(petName) ||
      rec.ingredients.some((i) => i.type === 'pet' && i.name === petName);
    if (!hit) continue;
    if (!map.has(rec.activityId)) map.set(rec.activityId, getActivityMeta(rec));
  }
  return [...map.values()];
}

/**
 * 為產物寵物建「由頂向下」合成樹：
 * root = 產物，children = 材料；材料若仍是某配方產物則遞迴展開。
 */
export function buildFusionTreeForPet(
  petName: string,
  opts: { maxDepth?: number } = {},
): FusionNode | null {
  ensureParsed();
  const maxDepth = opts.maxDepth ?? 6;
  const recipes = listRecipesForProduct(petName);
  if (!recipes.length) return null;

  // 根節點允許「材料含自己」的進階列（例如重抽出稀有型），但優先真合成
  const pick =
    pickPrimaryRecipe(petName, recipes, { preferNonSelfFeed: true }) ??
    pickPrimaryRecipe(petName, recipes);
  if (!pick) return null;
  return expandProduct(petName, pick, new Set([petName]), 0, maxDepth);
}

/**
 * 選主配方。
 * 重抽／保底列（材料含自己）分數大降；展開子樹時可要求必須有「別的寵物材料」。
 */
function pickPrimaryRecipe(
  petName: string,
  recipes: ParsedRecipe[],
  opts: { preferNonSelfFeed?: boolean } = {},
): ParsedRecipe | null {
  if (!recipes.length) return null;
  let pool = recipes;
  if (opts.preferNonSelfFeed) {
    const nonSelf = recipes.filter(
      (r) => !r.ingredients.some((i) => i.type === 'pet' && i.name === petName),
    );
    // 沒有「真正由其他寵合成」的配方 → 不展開（葉節點）
    if (!nonSelf.length) return null;
    pool = nonSelf;
  }
  const scored = pool.map((r) => {
    const petIng = r.ingredients.filter((i) => i.type === 'pet');
    const otherPets = petIng.filter((i) => i.name !== petName).length;
    const selfFeed = petIng.some((i) => i.name === petName) ? 1 : 0;
    return {
      r,
      score: otherPets * 10 + r.ingredients.length - selfFeed * 50,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.r ?? null;
}

function expandProduct(
  petName: string,
  recipe: ParsedRecipe,
  stack: Set<string>,
  depth: number,
  maxDepth: number,
): FusionNode {
  const npcLine = formatNpcLine(recipe);
  const children: FusionNode[] = recipe.ingredients.map((ing) => {
    if (ing.type !== 'pet') return { ...ing };
    if (stack.has(ing.name) || depth >= maxDepth) {
      return { ...ing, image: ssotImage(ing.name) };
    }
    const subRecipes = listRecipesForProduct(ing.name);
    if (!subRecipes.length) {
      return { ...ing, image: ssotImage(ing.name) };
    }
    // 子寵展開：同活動優先，且不要用「材料含自己」的重抽列
    const sameAct = subRecipes.find(
      (r) =>
        r.activityId === recipe.activityId &&
        !r.ingredients.some((i) => i.type === 'pet' && i.name === ing.name),
    );
    const sub =
      sameAct ??
      pickPrimaryRecipe(ing.name, subRecipes, { preferNonSelfFeed: true });
    if (!sub) {
      return { ...ing, image: ssotImage(ing.name) };
    }
    const next = new Set(stack);
    next.add(ing.name);
    return expandProduct(ing.name, sub, next, depth + 1, maxDepth);
  });

  const alt = recipe.productPets.filter((p) => p !== petName);
  const altNote =
    alt.length > 0
      ? `其他產物：${alt.join('、')}`
      : recipe.productLabels.length > 1
        ? `產物分支：${recipe.productLabels.join(' / ')}`
        : '';

  return {
    type: 'pet',
    name: petName,
    image: ssotImage(petName),
    target: depth === 0,
    npc: [npcLine, altNote].filter(Boolean).join(' · '),
    children,
  };
}

function formatNpcLine(recipe: ParsedRecipe): string {
  const meta = getActivityMeta(recipe);
  const npc = recipe.npc && recipe.npc !== '公告未載明' ? recipe.npc : '';
  const bits = [npc, meta.title, meta.period].filter(Boolean);
  return bits.join(' ｜ ');
}

/** 寵物詳情「相關合成活動」連結（帶 # 錨點） */
export function synthesisObtainMethods(petName: string, base = ''): ObtainMethod[] {
  return listActivitiesForPet(petName).map((a) => ({
    type: 'fusion',
    map: a.title,
    note: a.period ? `活動期間：${a.period}` : a.announcementDate || undefined,
    link: synthesisActivityHref(a.id, base),
  }));
}

export function synthesisTreeStats(): { recipes: number; products: number } {
  ensureParsed();
  return {
    recipes: recipeCache?.length ?? 0,
    products: byProduct?.size ?? 0,
  };
}
