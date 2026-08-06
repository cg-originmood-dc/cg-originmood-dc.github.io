/**
 * 合成圖相容層
 *
 * 實作已遷至 src/lib/fusion/（統一 Reaction IR → 編譯圖 → 查詢）。
 * 本檔 re-export 舊名稱，避免外部 import 大改。
 *
 * 架構（務必遵守）：
 * 1. 正規化合成途徑三表 lower 成 FusionReaction
 * 2. compile 去重、建 byProduct / parents / edgeReactions
 * 3. query 只讀編譯圖：全部根 + 完整向下展開（不挑主配方）
 * 4. 新配方加入資料三表，勿在此旁路塞邏輯
 */
export {
  buildFusionTreeFromGraph,
  expandFusionDown,
  findFusionRoots,
  findFusionRootPaths,
  listFusionParents,
  resetFusionGraph,
  fusionGraphStats,
  getReactionsForProduct,
  getFusionCycleGroupForPet,
  compileFusionGraph,
  normalizePetName,
  type FusionReaction,
  type FusionRootPath,
  type FusionCycleGroup,
  type CompiledFusionGraph,
} from './fusion';

import type { FusionReaction as IRReaction, FusionSlot } from './fusion';
import { getReactionsForProduct } from './fusion';
import type { FusionNode } from './pets';
import type { ProductOutcome } from './synthesis';
import { itemImagePath } from './items';

/** 舊 UI 相容層使用的 FusionRecipe 資料形狀。 */
export interface LegacyFusionRecipe {
  products: string[];
  productProb: Record<string, string>;
  multi: boolean;
  itemOutcomes: ProductOutcome[];
  materials: FusionNode[];
  npc: string;
  source: 'handwritten' | 'csv' | 'military' | 'remodel';
}

/** @deprecated 舊 UI 形狀；新碼請用 FusionReaction（IR） */
export type FusionRecipe = LegacyFusionRecipe;

function petImg(name: string): string {
  return `/img/專屬寵物/${name}.gif`;
}

function slotToNode(s: FusionSlot): FusionNode {
  if (s.kind === 'pet') {
    return {
      type: 'pet',
      name: s.symbol,
      image: petImg(s.symbol),
      ...(s.qty != null ? { qty: s.qty } : {}),
    };
  }
  if (s.kind === 'gold') {
    return { type: 'gold', name: s.symbol, countLabel: '金幣' };
  }
  const image = itemImagePath(s.symbol);
  return {
    type: 'item',
    name: s.symbol,
    ...(image ? { image } : {}),
    ...(s.qty != null ? { qty: s.qty } : {}),
  };
}

function irToLegacy(r: IRReaction): LegacyFusionRecipe {
  const products = r.products.filter((p) => p.kind === 'pet').map((p) => p.symbol);
  const productProb: Record<string, string> = {};
  for (const p of r.products) {
    if (p.kind === 'pet' && p.prob) productProb[p.symbol] = p.prob;
  }
  const itemOutcomes: ProductOutcome[] = r.products
    .filter((p) => p.kind === 'item')
    .map((p) => ({
      type: 'item' as const,
      name: p.symbol,
      ...(p.qty != null ? { qty: p.qty } : {}),
      ...(p.prob ? { prob: p.prob } : {}),
    }));
  return {
    products,
    productProb,
    multi: r.products.length > 1,
    itemOutcomes,
    materials: r.materials.map(slotToNode),
    npc: r.npc,
    source: r.source,
  };
}

/** 產物的全部配方（舊 FusionRecipe 形狀） */
export function getFusionRecipes(productPet: string): LegacyFusionRecipe[] {
  return getReactionsForProduct(productPet).map(irToLegacy);
}

/** @deprecated 請用 getFusionRecipes */
export function getFusionRecipe(productPet: string): LegacyFusionRecipe | undefined {
  return getFusionRecipes(productPet)[0];
}
