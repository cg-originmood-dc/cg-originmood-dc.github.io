/**
 * 編譯器：正規化合成途徑 → CompiledFusionGraph
 */
import type {
  CompiledFusionGraph,
  FusionCycleGroup,
  FusionReaction,
  ParentEdge,
} from './types';
import { edgeKey, petSymbols, reactionSignature } from './types';
import { adaptPathwayReactions } from './adapters/pathways';

let cached: CompiledFusionGraph | null = null;

export function resetFusionGraph(): void {
  cached = null;
}

/** 唯一資料入口；同公式去重不改變寵物連線與循環結果。 */
function collectAllReactions(): FusionReaction[] {
  return adaptPathwayReactions();
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
function parentEdgeScore(r: FusionReaction, from: string): number {
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
        const score = parentEdgeScore(r, from);
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
 * 只依明確的材料寵 → 產物寵連線找強連通分量。
 * 至少兩隻寵物互相可達才是循環；自我投入不單獨列群組。
 */
function deriveCycleGroups(reactions: FusionReaction[]): FusionCycleGroup[] {
  const adjacency = new Map<string, Set<string>>();
  const nodes = new Set<string>();
  for (const reaction of reactions) {
    const materials = petSymbols(reaction.materials);
    const products = petSymbols(reaction.products);
    for (const material of materials) {
      nodes.add(material);
      const next = adjacency.get(material) ?? new Set<string>();
      for (const product of products) {
        nodes.add(product);
        if (material !== product) next.add(product);
      }
      adjacency.set(material, next);
    }
    for (const product of products) nodes.add(product);
  }

  let nextIndex = 0;
  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (node: string): void => {
    index.set(node, nextIndex);
    lowLink.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of adjacency.get(node) ?? []) {
      if (!index.has(target)) {
        visit(target);
        lowLink.set(node, Math.min(lowLink.get(node)!, lowLink.get(target)!));
      } else if (onStack.has(target)) {
        lowLink.set(node, Math.min(lowLink.get(node)!, index.get(target)!));
      }
    }

    if (lowLink.get(node) !== index.get(node)) return;
    const component: string[] = [];
    while (stack.length) {
      const current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
      if (current === node) break;
    }
    if (component.length >= 2) components.push(component);
  };

  for (const node of [...nodes].sort((a, b) => a.localeCompare(b, 'zh-Hant'))) {
    if (!index.has(node)) visit(node);
  }

  const groups = components.map((members) => {
    members.sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const memberSet = new Set(members);
    const reactionIds = reactions
      .filter((reaction) => {
        const materials = petSymbols(reaction.materials);
        const products = petSymbols(reaction.products);
        return materials.some((material) =>
          memberSet.has(material) &&
          products.some((product) => memberSet.has(product) && product !== material),
        );
      })
      .map((reaction) => reaction.id)
      .sort();
    return { id: '', members, reactionIds };
  });
  groups.sort((a, b) =>
    a.members.join('\0').localeCompare(b.members.join('\0'), 'zh-Hant'),
  );
  return groups.map((group, index) => ({
    ...group,
    id: `cycle-${String(index + 1).padStart(3, '0')}`,
  }));
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
  const cycleGroups = deriveCycleGroups(reactions);
  const petToCycleGroup = new Map<string, FusionCycleGroup>();
  for (const group of cycleGroups) {
    for (const member of group.members) petToCycleGroup.set(member, group);
  }

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
  cycleGroups: number;
  cyclePets: number;
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
    cycleGroups: g.cycleGroups.length,
    cyclePets: g.petToCycleGroup.size,
    sources,
  };
}
