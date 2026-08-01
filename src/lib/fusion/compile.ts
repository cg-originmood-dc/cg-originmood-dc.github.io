/**
 * 編譯器：各來源 Reaction[] → CompiledFusionGraph
 * 之後只加 adapter + 在此註冊即可。
 */
import type {
  CompiledFusionGraph,
  FusionCycleGroup,
  FusionReaction,
  ParentEdge,
} from './types';
import { edgeKey, petSymbols, reactionSignature } from './types';
import { adaptCsvReactions } from './adapters/csv';
import { adaptMilitaryReactions } from './adapters/military';
import { adaptRemodelReactions } from './adapters/remodel';
import {
  adaptHandwrittenReactions,
  type HandwrittenTreeProvider,
} from './adapters/handwritten';

let handwrittenProvider: HandwrittenTreeProvider | null = null;
let cached: CompiledFusionGraph | null = null;

/** pets extras 注入（避免 fusion → pets 循環） */
export function setHandwrittenFusionTrees(provider: HandwrittenTreeProvider): void {
  handwrittenProvider = provider;
  cached = null;
}

export function resetFusionGraph(): void {
  cached = null;
}

/**
 * 註冊表：新來源在此加一行 adapter。
 * 順序僅影響同簽名去重時「先到先贏」的 id／source 標籤，不影響分析結果。
 */
function collectAllReactions(): FusionReaction[] {
  return [
    ...adaptHandwrittenReactions(handwrittenProvider),
    ...adaptCsvReactions(),
    ...adaptMilitaryReactions(),
    ...adaptRemodelReactions(),
  ];
}

function dedupeReactions(raw: FusionReaction[]): FusionReaction[] {
  const seen = new Map<string, FusionReaction>();
  for (const r of raw) {
    const sig = reactionSignature(r);
    if (!seen.has(sig)) seen.set(sig, r);
  }
  return [...seen.values()];
}

/**
 * 邊適合作「上級」的分數（愈高愈像取得／升級線）。
 * 重抽（材料自己也是產物）分數低；單一產物升級線分數高。
 */
function parentEdgeScore(r: FusionReaction, from: string, to: string): number {
  const prods = petSymbols(r.products);
  const selfFeed = prods.includes(from) ? 1 : 0;
  const multi = prods.length > 1 ? 1 : 0;
  // 取得線（材料不含自己）遠高於重抽
  return (1 - selfFeed) * 100 + (1 - multi) * 10 + r.materials.length;
}

/**
 * 由反應衍生 parent 邊：材料寵 → 產物寵（A≠B）。
 * 若 A→B 與 B→A 同時存在（洗髓升級 ↔ 重抽互環），只保留分數較高的方向，
 * 避免祖先集合形成環後「找不到根」。
 */
function deriveParentEdges(reactions: FusionReaction[]): ParentEdge[] {
  type Cand = ParentEdge & { score: number };
  const best = new Map<string, Cand>(); // from\0to → best

  for (const r of reactions) {
    const mats = petSymbols(r.materials);
    const prods = petSymbols(r.products);
    for (const from of mats) {
      for (const to of prods) {
        if (!from || !to || from === to) continue;
        const pair = `${from}\0${to}`;
        const score = parentEdgeScore(r, from, to);
        const prev = best.get(pair);
        if (!prev || score > prev.score) {
          best.set(pair, { from, to, recipeId: r.id, score });
        }
      }
    }
  }

  // 拆互環：只留分數高的一邊；同分則字典序穩定
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
  return edges;
}

/**
 * 寵物材料 → 寵物產物 有向邊（含自環），供 SCC 偵測互轉循環。
 * 與 parent 邊不同：此處不拆互環、保留自環。
 */
function buildPetAdj(reactions: FusionReaction[]): {
  nodes: string[];
  adj: Map<string, Set<string>>;
} {
  const adj = new Map<string, Set<string>>();
  const nodeSet = new Set<string>();
  const add = (a: string, b: string) => {
    nodeSet.add(a);
    nodeSet.add(b);
    let s = adj.get(a);
    if (!s) {
      s = new Set();
      adj.set(a, s);
    }
    s.add(b);
  };
  for (const r of reactions) {
    const mats = petSymbols(r.materials);
    const prods = petSymbols(r.products);
    for (const m of mats) {
      for (const p of prods) {
        if (m && p) add(m, p);
      }
    }
  }
  return {
    nodes: [...nodeSet].sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    adj,
  };
}

/** Tarjan SCC */
function tarjanScc(
  nodes: string[],
  adj: Map<string, Set<string>>,
): string[][] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const comps: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const comp: string[] = [];
      for (;;) {
        const w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
        if (w === v) break;
      }
      comps.push(comp);
    }
  }

  for (const v of nodes) {
    if (!indices.has(v)) strongconnect(v);
  }
  return comps;
}

function pickGroupLabel(
  members: string[],
  memberSet: Set<string>,
  reactions: FusionReaction[],
): string {
  // 優先：多產物重抽的材料寵（如熊霸）
  for (const r of reactions) {
    if (r.products.length < 2) continue;
    for (const m of petSymbols(r.materials)) {
      if (memberSet.has(m)) return `${m}系轉換`;
    }
  }
  const sorted = [...members].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  return `${sorted[0]}系轉換`;
}

/**
 * 由寵→寵有向圖算 SCC；僅 size≥2 視為互轉循環群組。
 * 單寵自環重抽仍走一般多頭樹，避免全站大量誤入模組 UI。
 */
function deriveCycleGroups(reactions: FusionReaction[]): FusionCycleGroup[] {
  const { nodes, adj } = buildPetAdj(reactions);
  const comps = tarjanScc(nodes, adj);
  const byId = new Map(reactions.map((r) => [r.id, r]));

  const groups: FusionCycleGroup[] = [];
  for (const raw of comps) {
    if (raw.length < 2) continue;
    const members = [...raw].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const memberSet = new Set(members);

    // 內部 reaction：寵物材料皆在群組內（或無寵物材料）且產物碰群組
    const reactionIds: string[] = [];
    for (const r of reactions) {
      const mats = petSymbols(r.materials);
      const prods = petSymbols(r.products);
      if (!prods.some((p) => memberSet.has(p))) continue;
      if (mats.length && !mats.every((m) => memberSet.has(m))) continue;
      reactionIds.push(r.id);
    }
    if (!reactionIds.length) continue;

    const label = pickGroupLabel(
      members,
      memberSet,
      reactionIds.map((id) => byId.get(id)!).filter(Boolean),
    );
    const id = `cycle:${members.join('+')}`;
    groups.push({
      id,
      members,
      label,
      reactionIds: reactionIds.sort(),
    });
  }

  groups.sort((a, b) => a.id.localeCompare(b.id, 'zh-Hant'));
  return groups;
}

export function compileFusionGraph(): CompiledFusionGraph {
  if (cached) return cached;

  const reactions = dedupeReactions(collectAllReactions());
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

  for (const e of deriveParentEdges(reactions)) {
    const list = parents.get(e.from) ?? [];
    list.push(e);
    parents.set(e.from, list);

    const reaction = byId.get(e.recipeId);
    if (reaction) {
      const ek = edgeKey(e.from, e.to);
      const er = edgeReactions.get(ek) ?? [];
      // 同邊同反應去重
      if (!er.some((x) => x.id === reaction.id)) {
        er.push(reaction);
        edgeReactions.set(ek, er);
      }
    }
  }

  // 上級列表穩定排序
  for (const [k, list] of parents) {
    list.sort(
      (a, b) =>
        a.to.localeCompare(b.to, 'zh-Hant') ||
        a.recipeId.localeCompare(b.recipeId),
    );
    parents.set(k, list);
  }

  const cycleGroups = deriveCycleGroups(reactions);
  const petToCycleGroup = new Map<string, FusionCycleGroup>();
  for (const g of cycleGroups) {
    for (const m of g.members) {
      petToCycleGroup.set(m, g);
    }
  }

  cached = {
    reactions,
    byProduct,
    byMaterial,
    parents,
    edgeReactions,
    petNodes,
    cycleGroups,
    petToCycleGroup,
  };
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
