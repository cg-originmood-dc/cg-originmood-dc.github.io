/**
 * 查詢／展樹：只讀 CompiledFusionGraph（圖論視圖）
 *
 * 不變量：
 * - SSOT 是圖（reaction 超邊 + parent 邊），不是每寵一棵獨立樹
 * - 同一視圖內，相同 reaction.id 的子結構只實例化一次（DAG memo）
 * - 不在此 parse 配方 CSV
 *
 * 效能：庫 ~數百 KB、反應 ~數百條；展樹僅 SSG 建頁，全寵合計通常 <100ms。
 */
import type { FusionNode } from '../pets';
import { petImagePath } from '../pets';
import { itemImagePath } from '../items';
import { compileFusionGraph } from './compile';
import { normalizePetName } from './names';
import type {
  CompiledFusionGraph,
  FusionReaction,
  FusionRootPath,
  FusionSlot,
} from './types';
import { petSymbols } from './types';

function petImg(name: string): string {
  // 專屬優先、再原生（與 getPet 一致）
  return petImagePath(name);
}

function graph(): CompiledFusionGraph {
  return compileFusionGraph();
}

/** 單一寵物頁的展開上下文（視圖生命週期內共用） */
interface ExpandCtx {
  maxDepth: number;
  /** reaction 展開結果：同 id 同角色只建一次 */
  byReaction: Map<string, FusionNode>;
  /** 嵌套產物向下展開 */
  byProductNested: Map<string, FusionNode>;
}

function newExpandCtx(maxDepth: number): ExpandCtx {
  return {
    maxDepth,
    byReaction: new Map(),
    byProductNested: new Map(),
  };
}

function reactionMemoKey(
  reaction: FusionReaction,
  focusName: string,
  isRoot: boolean,
): string {
  // 多產物根：只看 reaction（與 focus 無關）→ 多根共用一枝
  if (isMulti(reaction) && isRoot) return `M:${reaction.id}`;
  return `S:${reaction.id}:${focusName}`;
}

export function getReactionsForProduct(productPet: string): FusionReaction[] {
  const g = graph();
  const name = normalizePetName(productPet);
  return (g.byProduct.get(name) ?? g.byProduct.get(productPet) ?? []).slice();
}

export function listFusionParents(materialPet: string): string[] {
  const g = graph();
  const name = normalizePetName(materialPet);
  const edges = g.parents.get(name) ?? g.parents.get(materialPet) ?? [];
  const set = new Set(edges.map((e) => e.to));
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

export function findFusionRoots(startPet: string): string[] {
  return findFusionRootPaths(startPet).map((r) => r.root);
}

/**
 * 從 start 沿 parent 邊（材料→產物）走，取全部根。
 * 根 = 祖先集合內不再有出邊指向集合內者。
 */
export function findFusionRootPaths(startPet: string): FusionRootPath[] {
  const g = graph();
  const start = normalizePetName(startPet) || startPet;
  if (!start) return [];

  const anc = new Set<string>([start]);
  const q: string[] = [start];
  while (q.length) {
    const n = q.shift()!;
    for (const e of g.parents.get(n) ?? []) {
      if (anc.has(e.to)) continue;
      anc.add(e.to);
      q.push(e.to);
    }
  }

  const childToParent = new Map<string, string>();
  for (const n of anc) {
    const pars = (g.parents.get(n) ?? [])
      .map((e) => e.to)
      .filter((p) => anc.has(p))
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    if (pars[0]) childToParent.set(n, pars[0]);
  }

  const roots: string[] = [];
  for (const n of anc) {
    const hasParentInAnc = (g.parents.get(n) ?? []).some((e) => anc.has(e.to));
    if (!hasParentInAnc) roots.push(n);
  }
  roots.sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  if (!roots.length) return [{ root: start, viaMaterial: null }];

  return roots.map((root) => {
    if (root === start) return { root, viaMaterial: null };
    let cur = start;
    let via: string | null = null;
    for (let guard = 0; guard < 32 && cur !== root; guard++) {
      const next = childToParent.get(cur);
      if (!next) break;
      if (next === root) {
        via = cur;
        break;
      }
      cur = next;
    }
    if (!via) {
      const direct = (g.parents.get(start) ?? []).some((e) => e.to === root);
      if (direct) via = start;
    }
    return { root, viaMaterial: via };
  });
}

/**
 * 展開用反應列表：
 * 1. 根：該產物全部反應
 * 2. 嵌套：取得線優先；僅自環重抽 → 空（當葉）
 * viaMaterial 不得裁剪根的配方集合。
 */
function resolveReactions(
  productPet: string,
  opts: { nested?: boolean } = {},
): FusionReaction[] {
  const g = graph();
  const all = g.byProduct.get(productPet)?.slice() ?? [];
  if (!all.length) return [];
  if (!opts.nested) return all;

  const obtain = all.filter((r) => !petSymbols(r.materials).includes(productPet));
  if (obtain.length) return obtain;
  return [];
}

function slotToMaterialNode(s: FusionSlot): FusionNode {
  if (s.kind === 'pet') {
    return {
      type: 'pet',
      name: s.symbol,
      image: petImg(s.symbol),
      ...(s.qty != null ? { qty: s.qty } : {}),
    };
  }
  if (s.kind === 'gold') {
    return {
      type: 'gold',
      name: s.symbol,
      countLabel: '金幣',
    };
  }
  const image = itemImagePath(s.symbol);
  return {
    type: 'item',
    name: s.symbol,
    ...(image ? { image } : {}),
    ...(s.qty != null ? { qty: s.qty } : {}),
  };
}

/**
 * 材料等級 + NPC 顯示字串（Spec）
 * - 任意等級 → 任意@
 * - 有寫等級 → {等級}等@（例 40等@）
 * - 沒寫 → 不標
 * 多材料時：有明確數字取最高；否則才用任意。
 */
export function formatReactionNpc(reaction: FusionReaction): string {
  const npc = (reaction.npc || '').trim();
  const levels = reaction.materials
    .filter((m) => m.kind === 'pet' && m.minLevel != null && m.minLevel > 0)
    .map((m) => m.minLevel!);
  const anyLevel = reaction.materials.some((m) => m.kind === 'pet' && m.anyLevel);
  let prefix = '';
  if (levels.length) {
    prefix = `${Math.max(...levels)}等@`;
  } else if (anyLevel) {
    prefix = '任意@';
  }
  return `${prefix}${npc}`;
}

function outcomeHeads(reaction: FusionReaction): FusionNode[] {
  const npc = formatReactionNpc(reaction);
  const heads: FusionNode[] = reaction.products.map((p) => {
    if (p.kind === 'pet') {
      return {
        type: 'pet' as const,
        name: p.symbol,
        image: petImg(p.symbol),
        ...(p.prob ? { countLabel: `機率 ${p.prob}` } : {}),
        ...(npc ? { npc } : {}),
      };
    }
    if (p.kind === 'gold') {
      return {
        type: 'gold' as const,
        name: p.symbol,
        countLabel: p.prob ? `機率 ${p.prob}` : '金幣',
        ...(npc ? { npc } : {}),
      };
    }
    const image = itemImagePath(p.symbol);
    return {
      type: 'item' as const,
      name: p.symbol,
      ...(image ? { image } : {}),
      ...(p.qty != null ? { qty: p.qty } : {}),
      ...(p.prob ? { countLabel: `機率 ${p.prob}` } : {}),
      ...(npc ? { npc } : {}),
    };
  });
  heads.sort((a, b) => {
    const pa = a.countLabel?.match(/([\d.]+)%/)?.[1];
    const pb = b.countLabel?.match(/([\d.]+)%/)?.[1];
    const na = pa ? Number(pa) : -1;
    const nb = pb ? Number(pb) : -1;
    if (nb !== na) return nb - na;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });
  return heads;
}

function forestOrSingle(nodes: FusionNode[], isRoot: boolean): FusionNode {
  if (nodes.length === 1) return nodes[0]!;
  return {
    type: 'material',
    name: '',
    target: isRoot,
    children: nodes,
  };
}

function isMulti(reaction: FusionReaction): boolean {
  return reaction.products.length > 1;
}

function leafPet(name: string, isRoot: boolean): FusionNode {
  return {
    type: 'pet',
    name,
    image: petImg(name),
    ...(isRoot ? { target: true } : {}),
  };
}

function expandOneReaction(
  name: string,
  reaction: FusionReaction,
  opts: {
    stack: Set<string>;
    depth: number;
    isRoot: boolean;
    ctx: ExpandCtx;
  },
): FusionNode {
  const g = graph();
  const { stack, depth, isRoot, ctx } = opts;
  const key = reactionMemoKey(reaction, name, isRoot);
  const hit = ctx.byReaction.get(key);
  if (hit) return hit;

  const children = reaction.materials.map((mat) => {
    if (mat.kind !== 'pet') return slotToMaterialNode(mat);
    if (stack.has(mat.symbol) || depth + 1 > ctx.maxDepth) {
      return slotToMaterialNode(mat);
    }
    if (g.byProduct.has(mat.symbol)) {
      return expandFusionDown(mat.symbol, {
        stack,
        depth: depth + 1,
        isRoot: false,
        ctx,
      });
    }
    return slotToMaterialNode(mat);
  });

  let node: FusionNode;
  if (isMulti(reaction) && isRoot) {
    node = {
      type: 'material',
      name: '',
      target: true,
      heads: outcomeHeads(reaction),
      children,
    };
  } else {
    const selfProd = reaction.products.find(
      (p) => p.kind === 'pet' && p.symbol === name,
    );
    const prob = selfProd?.prob;
    const npc = formatReactionNpc(reaction);
    node = {
      type: 'pet',
      name,
      image: petImg(name),
      target: isRoot,
      ...(prob ? { countLabel: `機率 ${prob}` } : {}),
      ...(npc ? { npc } : {}),
      children,
    };
  }

  ctx.byReaction.set(key, node);
  return node;
}

export function expandFusionDown(
  productPet: string,
  opts: {
    stack?: Set<string>;
    depth?: number;
    maxDepth?: number;
    isRoot?: boolean;
    viaMaterial?: string | null;
    ctx?: ExpandCtx;
  } = {},
): FusionNode {
  const name = normalizePetName(productPet) || productPet;
  const depth = opts.depth ?? 0;
  const stack = opts.stack ?? new Set<string>();
  const isRoot = opts.isRoot ?? depth === 0;
  const ctx =
    opts.ctx ??
    newExpandCtx(opts.maxDepth ?? 10);

  if (!name || stack.has(name) || depth > ctx.maxDepth) {
    return leafPet(name, isRoot);
  }

  if (!isRoot) {
    const nestedHit = ctx.byProductNested.get(name);
    if (nestedHit) return nestedHit;
  }

  const reactions = resolveReactions(name, { nested: !isRoot });
  if (!reactions.length) {
    return leafPet(name, isRoot);
  }

  const next = new Set(stack);
  next.add(name);

  const expanded = reactions.map((reaction) =>
    expandOneReaction(name, reaction, {
      stack: next,
      depth,
      isRoot,
      ctx,
    }),
  );
  const result = forestOrSingle(expanded, isRoot);
  if (!isRoot) ctx.byProductNested.set(name, result);
  return result;
}

function treeHasBody(node: FusionNode): boolean {
  return Boolean(node.children?.length || node.heads?.length);
}

function inGraph(name: string): boolean {
  const g = graph();
  if (g.byProduct.has(name) || g.byMaterial.has(name) || g.petNodes.has(name)) {
    return true;
  }
  if ((g.parents.get(name)?.length ?? 0) > 0) return true;
  for (const k of g.edgeReactions.keys()) {
    if (k.startsWith(`${name}\0`) || k.endsWith(`\0${name}`)) return true;
  }
  return false;
}

/**
 * 顯示用合成視圖（有根 DAG → 給 UI 的樹形）：
 * 1. 上溯全部根
 * 2. 各根向下展開；同一 reaction 子結構 memo 共用
 * 3. 森林層對「同一 memo 節點」去重（多產物重抽不會兩枝）
 */
export function buildFusionTreeFromGraph(
  petName: string,
  opts: { maxDepth?: number } = {},
): FusionNode | null {
  const name = normalizePetName(petName) || petName;
  if (!name || !inGraph(name)) return null;

  const maxDepth = opts.maxDepth ?? 10;
  const ctx = newExpandCtx(maxDepth);
  const roots = [...new Set(findFusionRootPaths(name).map((r) => r.root))];

  const children: FusionNode[] = [];
  const seenNodes = new Set<FusionNode>();

  for (const root of roots) {
    const tree = expandFusionDown(root, {
      stack: new Set(),
      depth: 0,
      isRoot: true,
      ctx,
    });
    if (seenNodes.has(tree)) continue;
    seenNodes.add(tree);
    children.push(tree);
  }

  if (!children.some(treeHasBody)) return null;
  if (children.length === 1) return children[0]!;
  return {
    type: 'material',
    name: '',
    target: true,
    children,
  };
}
