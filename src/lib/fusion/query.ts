/**
 * 查詢／展樹：只讀 CompiledFusionGraph
 */
import type {
  FusionCycleGraph,
  FusionCycleGraphReaction,
  FusionNode,
} from '../pets';
import { itemImagePath } from '../items';
import { compileFusionGraph } from './compile';
import { normalizePetName } from './names';
import type {
  CompiledFusionGraph,
  FusionCycleGroup,
  FusionReaction,
  FusionRootPath,
  FusionSlot,
  ReactionKind,
} from './types';
import { petSymbols } from './types';

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
 * 展開用反應列表（固定算法，勿再改成「上溯路徑裁成一條」）：
 *
 * 1. **根結點**：該產物的**全部**反應 → 完整樹／森林（不挑主配方、不因入邊縮成一層）
 * 2. **嵌套材料**：優先「取得線」（材料不含自己），避免重抽自環把上級塞回材料格
 *
 * findFusionRootPaths 的 viaMaterial 只是上溯路徑紀錄，**不得**餵進來裁剪配方集合。
 */
function resolveReactions(
  productPet: string,
  opts: { nested?: boolean } = {},
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
    // 材料若屬互轉循環群組：不遞迴複製整圈，只留引用標籤
    const matGroup = g.petToCycleGroup.get(mat.symbol);
    if (matGroup) {
      const leaf = slotToMaterialNode(mat);
      return {
        ...leaf,
        countLabel: leaf.countLabel ?? `→ ${matGroup.label}`,
      };
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

  const reactions = resolveReactions(name, { nested: !isRoot });
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
  return Boolean(
    node.children?.length || node.heads?.length || node.cycleModule,
  );
}

/**
 * petNodes 在 compile 時就收了每條反應的全部寵物符號（產物＋材料），
 * byProduct／byMaterial／parents／edgeReactions 的鍵與端點都出自同一批，
 * 不必再逐一檢查——尤其別掃 edgeReactions 的 key，那是 O(邊數) 的線性掃描。
 */
function inGraph(name: string): boolean {
  return graph().petNodes.has(name);
}

/** 形狀推斷 reaction_kind（資料未填 kind 時） */
function inferReactionKind(
  r: FusionReaction,
  memberSet: Set<string>,
): ReactionKind {
  if (r.kind) return r.kind;
  if (r.products.length > 1) return 'reroll';
  const mats = petSymbols(r.materials);
  const prods = petSymbols(r.products);
  const selfFeed =
    mats.some((m) => prods.includes(m)) ||
    (mats.length === 1 && prods.length === 1 && mats[0] === prods[0]);
  if (selfFeed) return 'reroll';
  if (mats.length && mats.every((m) => memberSet.has(m))) return 'convert';
  return 'acquire';
}

/**
 * 把循環群組正規化成「實體節點＋反應超邊」：
 * - 寵物／道具是唯一可見節點；反應匯合位置只存在於畫面幾何，不是節點
 * - 多產物反應的每個產物保留自己的節點實例，避免把自循環錯誤壓成一張卡
 * - 同一個道具在多條反應間共用一張節點卡（例如洗髓丹）
 */
function buildCycleGraph(
  internal: FusionReaction[],
  memberSet: Set<string>,
): FusionCycleGraph {
  const nodes: FusionCycleGraph['nodes'] = [];
  const reactions: FusionCycleGraphReaction[] = [];
  const sharedEntities = new Map<string, string>();

  function addNode(
    slot: FusionSlot,
    occurrence: string,
    shared = false,
    display?: { prob?: string; npc?: string },
  ): string {
    const key = `${slot.kind}:${slot.symbol}`;
    if (shared) {
      const existing = sharedEntities.get(key);
      if (existing) return existing;
    }

    const id = shared ? key : `${key}:${occurrence}`;
    nodes.push({
      id,
      node: {
        ...slotToMaterialNode(slot),
        ...(display?.prob ? { countLabel: `機率 ${display.prob}` } : {}),
        ...(display?.npc ? { npc: display.npc } : {}),
      },
    });
    if (shared) sharedEntities.set(key, id);
    return id;
  }

  function addInputNode(
    slot: FusionSlot,
    reactionId: string,
    index: number,
    hubOutputs: Map<string, string>,
  ): string {
    // 循環內的寵物產物接回同一張產物節點；道具則依名稱共用。
    if (slot.kind === 'pet') {
      const upstream = hubOutputs.get(slot.symbol);
      if (upstream) return upstream;
      return addNode(slot, `input:${reactionId}:${index}`);
    }
    return addNode(slot, `input:${reactionId}:${index}`, true);
  }

  if (!internal.length) return { nodes, reactions };

  // 目前循環的主幹是多產物重抽；先放它，後續反應才能接到 C／D 等產物節點。
  const hub =
    internal.find((reaction) => reaction.products.length > 1) ?? internal[0]!;
  const rest = internal.filter((reaction) => reaction.id !== hub.id);
  const hubOutputs = new Map<string, string>();

  const hubInputs = hub.materials.map((slot, index) => ({
    nodeId: addNode(slot, `input:${hub.id}:${index}`, slot.kind !== 'pet'),
    ...(slot.qty != null ? { qty: slot.qty } : {}),
  }));
  const hubProducts = hub.products.map((slot, index) => {
    const nodeId = addNode(
      slot,
      `output:${hub.id}:${index}`,
      slot.kind !== 'pet',
      { prob: slot.prob, npc: hub.npc.trim() },
    );
    if (slot.kind === 'pet' && !hubOutputs.has(slot.symbol)) {
      hubOutputs.set(slot.symbol, nodeId);
    }
    return {
      nodeId,
      ...(slot.prob ? { prob: slot.prob } : {}),
      ...(slot.qty != null ? { qty: slot.qty } : {}),
    };
  });
  reactions.push({
    id: hub.id,
    kind: inferReactionKind(hub, memberSet),
    inputs: hubInputs,
    outputs: hubProducts,
    ...((hub.npc || '').trim() ? { npc: hub.npc.trim() } : {}),
  });

  for (const reaction of rest) {
    const inputs = reaction.materials.map((slot, index) => ({
      nodeId: addInputNode(slot, reaction.id, index, hubOutputs),
      ...(slot.qty != null ? { qty: slot.qty } : {}),
    }));
    const outputs = reaction.products.map((slot, index) => ({
      nodeId: addNode(
        slot,
        `output:${reaction.id}:${index}`,
        slot.kind !== 'pet',
        { prob: slot.prob, npc: reaction.npc.trim() },
      ),
      ...(slot.prob ? { prob: slot.prob } : {}),
      ...(slot.qty != null ? { qty: slot.qty } : {}),
    }));
    reactions.push({
      id: reaction.id,
      kind: inferReactionKind(reaction, memberSet),
      inputs,
      outputs,
      ...((reaction.npc || '').trim() ? { npc: reaction.npc.trim() } : {}),
    });
  }

  return { nodes, reactions };
}

function buildCycleGroupView(
  focusedPet: string,
  group: FusionCycleGroup,
): FusionNode {
  const g = graph();
  const byId = new Map(g.reactions.map((reaction) => [reaction.id, reaction]));
  const internal = group.reactionIds
    .map((id) => byId.get(id))
    .filter((reaction): reaction is FusionReaction => Boolean(reaction));

  return {
    type: 'material',
    name: group.label,
    target: true,
    cycleModule: {
      id: group.id,
      label: group.label,
      focusedPet,
      graph: buildCycleGraph(internal, new Set(group.members)),
    },
  };
}

/**
 * 顯示用合成樹（SSOT 算法）：
 * 1. 若寵物屬互轉循環群組 → 只顯示一張由實體節點與連線組成的局部圖
 * 2. 否則：從目前寵沿上級上溯 → 找全部根 → 各根向下完整展開
 * 3. 多根／多配方 → 森林
 */
export function buildFusionTreeFromGraph(
  petName: string,
  opts: { maxDepth?: number } = {},
): FusionNode | null {
  const name = normalizePetName(petName) || petName;
  if (!name || !inGraph(name)) return null;

  const maxDepth = opts.maxDepth ?? 10;
  const g = graph();
  const cycle = g.petToCycleGroup.get(name);
  if (cycle) {
    const tree = buildCycleGroupView(name, cycle);
    return treeHasBody(tree) ? tree : null;
  }

  // 只取根名；via 不參與展開裁剪
  const roots = [...new Set(findFusionRootPaths(name).map((r) => r.root))];

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

/** 查寵物所屬循環群組（無則 null） */
export function getCycleGroupForPet(
  petName: string,
): FusionCycleGroup | null {
  const name = normalizePetName(petName) || petName;
  if (!name) return null;
  return graph().petToCycleGroup.get(name) ?? null;
}
