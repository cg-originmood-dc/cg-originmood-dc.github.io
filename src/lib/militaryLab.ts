/**
 * 軍方研究所合成樹：使用一次解析後的靜態配方（militaryLabData.ts）
 * 不在 runtime 讀取 MD。
 *
 * 產物異名在載入時正規化；葉節點展開由 pets.resolveFusionTree 統一 merge。
 */
import type { FusionNode, ObtainMethod } from './pets';
import { itemImagePath } from './items';
import {
  MILITARY_LAB_PAGE,
  MILITARY_LAB_RECIPES,
  MILITARY_PRODUCT_ALIASES,
  type MilitaryLabRecipe,
} from './militaryLabData';

/** 攻略名／異名 → 正式寵物名 */
export function normalizeMilitaryPetName(name: string): string {
  const n = (name ?? '').trim();
  return MILITARY_PRODUCT_ALIASES[n] ?? n;
}

const byProduct = new Map<string, MilitaryLabRecipe>();
const byBase = new Map<string, MilitaryLabRecipe[]>();

for (const raw of MILITARY_LAB_RECIPES) {
  const r: MilitaryLabRecipe = {
    ...raw,
    product: normalizeMilitaryPetName(raw.product),
    basePet: normalizeMilitaryPetName(raw.basePet),
  };
  byProduct.set(r.product, r);
  // 異名也可查到同一配方
  for (const [alias, canon] of Object.entries(MILITARY_PRODUCT_ALIASES)) {
    if (canon === r.product) byProduct.set(alias, r);
  }
  const list = byBase.get(r.basePet) ?? [];
  list.push(r);
  byBase.set(r.basePet, list);
}

function petImage(name: string): string {
  return `/img/專屬寵物/${name}.gif`;
}

function itemNode(name: string, qty: number): FusionNode {
  const image = itemImagePath(name);
  return {
    type: 'item',
    name,
    ...(image ? { image } : {}),
    qty,
  };
}

/** 軍方產物配方（正式名或異名） */
export function getMilitaryLabRecipe(
  product: string,
): MilitaryLabRecipe | undefined {
  return byProduct.get(normalizeMilitaryPetName(product)) ?? byProduct.get(product);
}

/**
 * 產物材料列：底寵（可再遞迴軍方）＋道具。
 * stack 已含本產物名稱。
 */
function materialChildren(
  recipe: MilitaryLabRecipe,
  stack: Set<string>,
  depth: number,
  maxDepth: number,
): FusionNode[] {
  const children: FusionNode[] = [];
  const base = recipe.basePet;

  if (stack.has(base) || depth >= maxDepth) {
    children.push({
      type: 'pet',
      name: base,
      image: petImage(base),
    });
  } else if (byProduct.has(base)) {
    const next = new Set(stack);
    next.add(base);
    const subRecipe = byProduct.get(base)!;
    children.push({
      type: 'pet',
      name: base,
      image: petImage(base),
      npc: subRecipe.npc,
      children: materialChildren(subRecipe, next, depth + 1, maxDepth),
    });
  } else {
    children.push({
      type: 'pet',
      name: base,
      image: petImage(base),
    });
  }

  for (const m of recipe.materials) {
    children.push(itemNode(m.name, m.qty));
  }
  return children;
}

/**
 * 若此寵為軍方產物，展開為合成樹節點（供統一 merge 接葉用）。
 */
export function expandMilitaryFusionForPet(
  petName: string,
  opts: { stack?: Set<string>; depth?: number; maxDepth?: number } = {},
): FusionNode | null {
  const name = normalizeMilitaryPetName(petName);
  const recipe = byProduct.get(name);
  if (!recipe) return null;

  const maxDepth = opts.maxDepth ?? 4;
  const depth = opts.depth ?? 0;
  const stack = opts.stack ?? new Set<string>();
  if (stack.has(name) || depth > maxDepth) return null;

  const next = new Set(stack);
  next.add(name);
  return {
    type: 'pet',
    name,
    image: petImage(name),
    target: depth === 0,
    npc: recipe.npc,
    children: materialChildren(recipe, next, depth, maxDepth),
  };
}

/**
 * 軍方相關的所有骨架樹（產物自己 + 以自己為底寵的更高階產物）。
 * 由 resolveFusionTree 統一 enrich／比大小，此處不提早 return 單一來源。
 */
export function listMilitaryLabCandidateTrees(
  petName: string,
  opts: { maxDepth?: number } = {},
): FusionNode[] {
  const maxDepth = opts.maxDepth ?? 4;
  const name = normalizeMilitaryPetName(petName);
  const out: FusionNode[] = [];
  const seen = new Set<string>();

  const push = (n: FusionNode | null) => {
    if (!n?.children?.length && !n?.heads?.length) return;
    const key = n.name || JSON.stringify(n.heads?.map((h) => h.name));
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };

  push(
    expandMilitaryFusionForPet(name, {
      stack: new Set(),
      depth: 0,
      maxDepth,
    }),
  );

  for (const r of byBase.get(name) ?? []) {
    push(
      expandMilitaryFusionForPet(r.product, {
        stack: new Set(),
        depth: 0,
        maxDepth,
      }),
    );
  }
  return out;
}

/**
 * 為寵物建軍方研究所合成樹（取候選中較完整者；完整 merge 請走 resolveFusionTree）。
 */
export function buildMilitaryLabTreeForPet(
  petName: string,
  opts: { maxDepth?: number } = {},
): FusionNode | null {
  const trees = listMilitaryLabCandidateTrees(petName, opts);
  if (!trees.length) return null;
  // 寵物節點較多者優先（二改線含一改）
  const score = (n: FusionNode): number => {
    let pets = 0;
    const walk = (x: FusionNode) => {
      if (x.type === 'pet' && x.name) pets++;
      for (const h of x.heads ?? []) walk(h);
      for (const c of x.children ?? []) walk(c);
    };
    walk(n);
    return pets;
  };
  trees.sort((a, b) => score(b) - score(a));
  return trees[0] ?? null;
}

export function petAppearsInMilitaryLab(petName: string): boolean {
  const name = normalizeMilitaryPetName(petName);
  return byProduct.has(name) || byBase.has(name) || byProduct.has(petName);
}

/** 相關活動：連到軍方研究所攻略頁 */
export function militaryLabObtainMethods(
  petName: string,
  base = '',
): ObtainMethod[] {
  if (!petAppearsInMilitaryLab(petName)) return [];
  const b = base.replace(/\/$/, '');
  const name = normalizeMilitaryPetName(petName);
  const asProduct = byProduct.get(name);
  const asBase = byBase.get(name) ?? [];
  const noteParts: string[] = [];
  if (asProduct) {
    noteParts.push(
      asProduct.tier === 2 ? '二改（拉拉克博士）' : '一改（洛伊克博士）',
    );
  }
  if (asBase.length) {
    noteParts.push(`可改造為：${asBase.map((r) => r.product).join('、')}`);
  }
  return [
    {
      type: 'fusion',
      map: '軍方研究所',
      note: noteParts.join('；') || undefined,
      link: `${b}${MILITARY_LAB_PAGE}`,
    },
  ];
}

export function listMilitaryLabRecipes(): MilitaryLabRecipe[] {
  return MILITARY_LAB_RECIPES.map((r) => ({
    ...r,
    product: normalizeMilitaryPetName(r.product),
    basePet: normalizeMilitaryPetName(r.basePet),
  }));
}
