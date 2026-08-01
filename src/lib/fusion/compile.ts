/**
 * 合成圖：執行期只讀 fusion-library.json，編成查詢索引。
 *
 * 髒來源 → adapter → 落盤：見 scripts/build_fusion_library.ts
 * 本檔禁止 import adapters / synthesis 配方 parse。
 */
import type {
  CompiledFusionGraph,
  FusionReaction,
  ParentEdge,
} from './types';
import { edgeKey, petSymbols } from './types';
import {
  loadFusionLibraryFile,
  type FusionLibraryFile,
} from './library';

let cached: CompiledFusionGraph | null = null;

/** 測試或 fusion:build 後清快取 */
export function resetFusionGraph(): void {
  cached = null;
}

/**
 * @deprecated 手寫樹已在 fusion:build 時編入合成庫；執行期呼叫為 no-op。
 */
export function setHandwrittenFusionTrees(_provider: unknown): void {
  /* runtime 不再收集 adapter */
}

/** 由已落盤的 reactions + parentEdges 建查詢索引（無 I/O、無 parse） */
export function indexFusionLibrary(lib: FusionLibraryFile): CompiledFusionGraph {
  const reactions = lib.reactions;
  const byProduct = new Map<string, FusionReaction[]>();
  const byMaterial = new Map<string, FusionReaction[]>();
  const parents = new Map<string, ParentEdge[]>();
  const edgeReactions = new Map<string, FusionReaction[]>();
  const petNodes = new Set<string>();
  const byId = new Map(reactions.map((r) => [r.id, r]));

  for (const r of reactions) {
    for (const p of petSymbols(r.products)) {
      petNodes.add(p);
      const list = byProduct.get(p) ?? [];
      list.push(r);
      byProduct.set(p, list);
    }
    for (const m of petSymbols(r.materials)) {
      petNodes.add(m);
      const list = byMaterial.get(m) ?? [];
      list.push(r);
      byMaterial.set(m, list);
    }
  }

  for (const e of lib.parentEdges) {
    const list = parents.get(e.from) ?? [];
    list.push(e);
    parents.set(e.from, list);

    const reaction = byId.get(e.recipeId);
    if (reaction) {
      const ek = edgeKey(e.from, e.to);
      const er = edgeReactions.get(ek) ?? [];
      if (!er.some((x) => x.id === reaction.id)) {
        er.push(reaction);
        edgeReactions.set(ek, er);
      }
    }
  }

  for (const [k, list] of parents) {
    list.sort(
      (a, b) =>
        a.to.localeCompare(b.to, 'zh-Hant') ||
        a.recipeId.localeCompare(b.recipeId),
    );
    parents.set(k, list);
  }

  return {
    reactions,
    byProduct,
    byMaterial,
    parents,
    edgeReactions,
    petNodes,
  };
}

/** 頁面／query 唯一入口：讀合成庫並索引（結果快取） */
export function compileFusionGraph(): CompiledFusionGraph {
  if (cached) return cached;
  cached = indexFusionLibrary(loadFusionLibraryFile());
  return cached;
}

export function fusionGraphStats(): {
  products: number;
  recipes: number;
  reverseEdges: number;
  sources: Record<string, number>;
} {
  const g = compileFusionGraph();
  let reverseEdges = 0;
  for (const list of g.parents.values()) reverseEdges += list.length;
  const sources: Record<string, number> = {};
  for (const r of g.reactions) {
    sources[r.source] = (sources[r.source] ?? 0) + 1;
  }
  return {
    products: g.byProduct.size,
    recipes: g.reactions.length,
    reverseEdges,
    sources,
  };
}
