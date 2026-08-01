/**
 * 僅供 scripts/build_fusion_library.ts：髒來源 → FusionReaction[] → parent 邊。
 * Astro 頁面路徑禁止 import 本檔。
 */
import type { FusionReaction, FusionSource, ParentEdge } from './types';
import { petSymbols, reactionCoreSignature, reactionSignature } from './types';
import { adaptCsvReactions } from './adapters/csv';
import { adaptMilitaryReactions } from './adapters/military';
import { adaptRemodelReactions } from './adapters/remodel';
import {
  adaptHandwrittenReactions,
  type HandwrittenTreeProvider,
} from './adapters/handwritten';
import type { FusionActivityMeta, FusionLibraryFile } from './library';
import { FUSION_LIBRARY_VERSION } from './library';
import {
  getActivityMeta,
  listSynthesisRecipes,
} from '../synthesis';
import { normalizePetName } from './names';

export type { HandwrittenTreeProvider };

/**
 * 同源／跨來源重複線時的保留優先序。
 * handwritten（已確認模板）> csv（含金幣／等級）> military > remodel（豆知識常與 CSV 重複）
 */
const SOURCE_RANK: Record<FusionSource, number> = {
  handwritten: 40,
  csv: 30,
  military: 20,
  remodel: 10,
};

function preferReaction(a: FusionReaction, b: FusionReaction): FusionReaction {
  // 多產物分支（含機率）優於單產物手寫摘要（例：風之使徒 csv 95%/5% vs handwritten）
  const pa = petSymbols(a.products).length;
  const pb = petSymbols(b.products).length;
  if (pa !== pb) return pa >= pb ? a : b;

  const ra = SOURCE_RANK[a.source] ?? 0;
  const rb = SOURCE_RANK[b.source] ?? 0;
  if (ra !== rb) return ra >= rb ? a : b;
  // 同來源：材料較多者優先（CSV 常多金幣槽）
  if (a.materials.length !== b.materials.length) {
    return a.materials.length >= b.materials.length ? a : b;
  }
  return a;
}

/** 略金幣後的材料簽名（用來抓「同材料、產物一為另一子集」的重複線） */
function materialCoreSignature(r: FusionReaction): string {
  return r.materials
    .filter((m) => m.kind !== 'gold')
    .map((m) => `${m.kind}\t${m.symbol}`)
    .sort()
    .join('|');
}

function petProductsOverlap(a: FusionReaction, b: FusionReaction): boolean {
  const sa = new Set(petSymbols(a.products));
  const sb = new Set(petSymbols(b.products));
  for (const p of sa) if (sb.has(p)) return true;
  return false;
}

/**
 * 去重：
 * 1. 粗簽名（略金幣／等級／NPC）合併 csv+remodel 等同線
 * 2. 同材料且產物有交集 → 再合（風之使徒 handwritten 單產物 vs csv 多產物）
 * 3. 細簽名再擋完全相同列
 */
function dedupeReactions(raw: FusionReaction[]): FusionReaction[] {
  const byCore = new Map<string, FusionReaction>();
  for (const r of raw) {
    const core = reactionCoreSignature(r);
    const prev = byCore.get(core);
    if (!prev) {
      byCore.set(core, r);
      continue;
    }
    byCore.set(core, preferReaction(prev, r));
  }

  // 材料相同、產物重疊：合併（例 風之使徒）
  const byMats = new Map<string, FusionReaction[]>();
  for (const r of byCore.values()) {
    const key = materialCoreSignature(r) || `__empty__${r.id}`;
    const list = byMats.get(key) ?? [];
    list.push(r);
    byMats.set(key, list);
  }
  const afterMats: FusionReaction[] = [];
  for (const list of byMats.values()) {
    if (list.length === 1) {
      afterMats.push(list[0]!);
      continue;
    }
    const kept: FusionReaction[] = [];
    for (const r of list) {
      let merged = false;
      for (let i = 0; i < kept.length; i++) {
        if (petProductsOverlap(kept[i]!, r)) {
          kept[i] = preferReaction(kept[i]!, r);
          merged = true;
          break;
        }
      }
      if (!merged) kept.push(r);
    }
    afterMats.push(...kept);
  }

  const byExact = new Map<string, FusionReaction>();
  for (const r of afterMats) {
    const sig = reactionSignature(r);
    if (!byExact.has(sig)) byExact.set(sig, r);
  }
  return [...byExact.values()];
}

function parentEdgeScore(r: FusionReaction, from: string): number {
  const prods = petSymbols(r.products);
  const selfFeed = prods.includes(from) ? 1 : 0;
  const multi = prods.length > 1 ? 1 : 0;
  return (1 - selfFeed) * 100 + (1 - multi) * 10 + r.materials.length;
}

/** 材料寵 → 產物寵；互環只留較像升級線的一邊 */
export function deriveParentEdges(reactions: FusionReaction[]): ParentEdge[] {
  type Cand = ParentEdge & { score: number };
  const best = new Map<string, Cand>();

  for (const r of reactions) {
    const mats = petSymbols(r.materials);
    const prods = petSymbols(r.products);
    for (const from of mats) {
      for (const to of prods) {
        if (!from || !to || from === to) continue;
        const pair = `${from}\0${to}`;
        const score = parentEdgeScore(r, from);
        const prev = best.get(pair);
        if (!prev || score > prev.score) {
          best.set(pair, { from, to, recipeId: r.id, score });
        }
      }
    }
  }

  const keys = [...best.keys()];
  const drop = new Set<string>();
  for (const k of keys) {
    if (drop.has(k)) continue;
    const e = best.get(k)!;
    const rev = `${e.to}\0${e.from}`;
    const other = best.get(rev);
    if (!other) continue;
    if (e.score > other.score) drop.add(rev);
    else if (other.score > e.score) drop.add(k);
    else if (e.from.localeCompare(e.to, 'zh-Hant') <= 0) drop.add(rev);
    else drop.add(k);
  }

  const edges: ParentEdge[] = [];
  for (const [k, e] of best) {
    if (drop.has(k)) continue;
    edges.push({ from: e.from, to: e.to, recipeId: e.recipeId });
  }
  edges.sort(
    (a, b) =>
      a.from.localeCompare(b.from, 'zh-Hant') ||
      a.to.localeCompare(b.to, 'zh-Hant') ||
      a.recipeId.localeCompare(b.recipeId),
  );
  return edges;
}

export function collectAllReactions(
  handwritten?: HandwrittenTreeProvider | null,
): FusionReaction[] {
  return dedupeReactions([
    ...adaptHandwrittenReactions(handwritten ?? null),
    ...adaptCsvReactions(),
    ...adaptMilitaryReactions(),
    ...adaptRemodelReactions(),
  ]);
}

/** 活動索引：只在 generate 時從配方 CSV 抽一次 */
function buildActivitiesByPet(): Record<string, FusionActivityMeta[]> {
  const map = new Map<string, Map<string, FusionActivityMeta>>();
  for (const rec of listSynthesisRecipes()) {
    const meta = getActivityMeta(rec);
    const pets = new Set<string>();
    for (const p of rec.productPets) {
      if (p) pets.add(normalizePetName(p));
    }
    for (const ing of rec.ingredients) {
      if (ing.type === 'pet' && ing.name) pets.add(normalizePetName(ing.name));
    }
    for (const pet of pets) {
      if (!pet) continue;
      let byId = map.get(pet);
      if (!byId) {
        byId = new Map();
        map.set(pet, byId);
      }
      if (!byId.has(meta.id)) byId.set(meta.id, meta);
    }
  }
  const out: Record<string, FusionActivityMeta[]> = {};
  for (const [pet, byId] of map) {
    out[pet] = [...byId.values()].sort((a, b) =>
      b.announcementDate.localeCompare(a.announcementDate),
    );
  }
  return out;
}

/** 明顯無效的道具槽（座標／純數字）— 不進合成庫 */
function isJunkItemSymbol(symbol: string): boolean {
  const n = (symbol ?? '').trim();
  if (!n) return true;
  if (/^\d+$/.test(n)) return true;
  if (/^\d{2,4}\.\d{1,4}$/.test(n)) return true;
  return false;
}

function scrubReactions(reactions: FusionReaction[]): FusionReaction[] {
  return reactions
    .map((r) => ({
      ...r,
      materials: r.materials.filter(
        (s) => s.kind !== 'item' || !isJunkItemSymbol(s.symbol),
      ),
      products: r.products.filter(
        (s) => s.kind !== 'item' || !isJunkItemSymbol(s.symbol),
      ),
    }))
    .filter((r) => r.products.some((p) => p.kind === 'pet'));
}

/** 組裝可寫入磁碟的合成庫物件 */
export function buildFusionLibraryFile(
  handwritten?: HandwrittenTreeProvider | null,
): FusionLibraryFile {
  const reactions = scrubReactions(collectAllReactions(handwritten));
  const parentEdges = deriveParentEdges(reactions);
  const sources: Record<string, number> = {};
  for (const r of reactions) {
    sources[r.source] = (sources[r.source] ?? 0) + 1;
  }
  return {
    version: FUSION_LIBRARY_VERSION,
    generatedAt: new Date().toISOString(),
    sources,
    reactions,
    parentEdges,
    activitiesByPet: buildActivitiesByPet(),
  };
}
