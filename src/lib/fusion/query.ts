/**
 * 查詢／展樹：只讀 CompiledFusionGraph
 */
import type { FusionNode } from '../pets';
import { itemImagePath } from '../items';
import { compileFusionGraph } from './compile';
import { normalizePetName } from './names';
import type {
  CompiledFusionGraph,
  FusionReaction,
  FusionRootPath,
  FusionSlot,
} from './types';
import { edgeKey, petSymbols } from './types';

function petImg(name: string): string {
  return `/img/專屬寵物/${name}.gif`;
}

function graph(): CompiledFusionGraph {
  return compileFusionGraph();
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
 * 從 start 沿 parent 邊上溯祖先，取全部根。
 * 根 = 祖先集合內不再有上級者。
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

  // 穩定：每點在 anc 內選字典序最小上級，構成 start→root 鏈
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
 * 展開用反應列表（固定算法，勿再改成「via 裁成一條」）：
 *
 * 1. **根結點**：該產物的**全部**反應 → 完整樹／森林（不挑主配方、不因入邊 via 縮成一層）
 * 2. **嵌套材料**：優先「取得線」（材料不含自己），避免重抽自環把上級塞回材料格
 *
 * viaMaterial 只用於上溯路徑紀錄，**不得**用來裁剪根的配方集合。
 */
function resolveReactions(
  productPet: string,
  opts: { viaMaterial?: string | null; nested?: boolean } = {},
): FusionReaction[] {
  const g = graph();
  const all = g.byProduct.get(productPet)?.slice() ?? [];
  if (!all.length) return [];

  // 根：完整全部配方
  if (!opts.nested) return all;

  // 嵌套：取得線優先
  const obtain = all.filter((r) => !petSymbols(r.materials).includes(productPet));
  if (obtain.length) return obtain;
  return all;
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

/** 多產物頭：NPC 掛在每個產物（名稱／機率下） */
function outcomeHeads(reaction: FusionReaction): FusionNode[] {
  const npc = (reaction.npc || '').trim();
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

function expandOneReaction(
  name: string,
  reaction: FusionReaction,
  opts: {
    stack: Set<string>;
    depth: number;
    maxDepth: number;
    isRoot: boolean;
  },
): FusionNode {
  const g = graph();
  const { stack: next, depth, maxDepth, isRoot } = opts;

  const children = reaction.materials.map((mat) => {
    if (mat.kind !== 'pet') return slotToMaterialNode(mat);
    if (next.has(mat.symbol) || depth + 1 > maxDepth) {
      return slotToMaterialNode(mat);
    }
    if (g.byProduct.has(mat.symbol)) {
      return expandFusionDown(mat.symbol, {
        stack: next,
        depth: depth + 1,
        maxDepth,
        isRoot: false,
      });
    }
    return slotToMaterialNode(mat);
  });

  // 多產物頭只在展開根；NPC 在 heads 上
  if (isMulti(reaction) && isRoot) {
    return {
      type: 'material',
      name: '',
      target: true,
      heads: outcomeHeads(reaction),
      children,
    };
  }

  const selfProd = reaction.products.find(
    (p) => p.kind === 'pet' && p.symbol === name,
  );
  const prob = selfProd?.prob;
  const npc = (reaction.npc || '').trim();

  return {
    type: 'pet',
    name,
    image: petImg(name),
    target: isRoot,
    ...(prob ? { countLabel: `機率 ${prob}` } : {}),
    ...(npc ? { npc } : {}),
    children,
  };
}

export function expandFusionDown(
  productPet: string,
  opts: {
    stack?: Set<string>;
    depth?: number;
    maxDepth?: number;
    isRoot?: boolean;
    viaMaterial?: string | null;
  } = {},
): FusionNode {
  const name = normalizePetName(productPet) || productPet;
  const maxDepth = opts.maxDepth ?? 10;
  const depth = opts.depth ?? 0;
  const stack = opts.stack ?? new Set<string>();
  const isRoot = opts.isRoot ?? depth === 0;

  if (!name || stack.has(name) || depth > maxDepth) {
    return {
      type: 'pet',
      name,
      image: petImg(name),
      ...(isRoot ? { target: true } : {}),
    };
  }

  const reactions = resolveReactions(name, {
    viaMaterial: opts.viaMaterial,
    nested: !isRoot,
  });
  if (!reactions.length) {
    return {
      type: 'pet',
      name,
      image: petImg(name),
      ...(isRoot ? { target: true } : {}),
    };
  }

  const next = new Set(stack);
  next.add(name);

  const expanded = reactions.map((reaction) =>
    expandOneReaction(name, reaction, {
      stack: next,
      depth,
      maxDepth,
      isRoot,
    }),
  );
  return forestOrSingle(expanded, isRoot);
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
 * 顯示用合成樹（SSOT 算法）：
 * 1. 從目前寵沿上級上溯 → 找**全部根**
 * 2. 從每個根向下 DFS **完整樹**（該根全部配方，不裁一條）
 * 3. 多根／多配方 → 森林
 */
export function buildFusionTreeFromGraph(
  petName: string,
  opts: { maxDepth?: number } = {},
): FusionNode | null {
  const name = normalizePetName(petName) || petName;
  if (!name || !inGraph(name)) return null;

  // 只取根名；via 不參與展開裁剪
  const roots = [...new Set(findFusionRootPaths(name).map((r) => r.root))];
  const maxDepth = opts.maxDepth ?? 10;

  if (roots.length === 1) {
    const tree = expandFusionDown(roots[0]!, {
      stack: new Set(),
      depth: 0,
      maxDepth,
      isRoot: true,
    });
    return treeHasBody(tree) ? tree : null;
  }

  const children = roots.map((root) =>
    expandFusionDown(root, {
      stack: new Set(),
      depth: 0,
      maxDepth,
      isRoot: true,
    }),
  );
  if (!children.some(treeHasBody)) return null;
  return {
    type: 'material',
    name: '',
    target: true,
    children,
  };
}
