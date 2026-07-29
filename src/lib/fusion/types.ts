/**
 * 合成圖統一 IR（編譯後唯讀）
 *
 * - Reaction：一級公民（多材料 → 多產物，超邊）
 * - ParentEdge：由 Reaction 衍生（材料寵 → 產物寵，不含自環）
 * - 新來源：加 adapter 吐出 FusionReaction[] 即可
 */

export type FusionSource = 'csv' | 'military' | 'remodel' | 'handwritten';

export type SymbolKind = 'pet' | 'item' | 'gold';

/** 反應式一端的槽位（材料或產物） */
export interface FusionSlot {
  symbol: string;
  kind: SymbolKind;
  qty?: number;
  /** 產物機率，如 "80%" */
  prob?: string;
}

/**
 * 一條合成反應（固定格式）
 * 所有來源 lower 後必須是這個形狀。
 */
export interface FusionReaction {
  /** 穩定 id（來源 + 內容指紋） */
  id: string;
  source: FusionSource;
  materials: FusionSlot[];
  products: FusionSlot[];
  npc: string;
  meta?: {
    activityId?: string;
    grades?: string;
    quest?: string;
  };
}

/** 材料寵 → 產物寵（上級方向）；自環不建 */
export interface ParentEdge {
  from: string;
  to: string;
  recipeId: string;
}

/** 編譯完成的合成圖（查詢／展樹只讀此結構） */
export interface CompiledFusionGraph {
  reactions: FusionReaction[];
  /** 產物寵 → 全部定義它的反應（不挑主配方） */
  byProduct: Map<string, FusionReaction[]>;
  /** 材料寵 → 使用它的反應 */
  byMaterial: Map<string, FusionReaction[]>;
  /** 材料寵 → 上級產物（含 recipeId 見證） */
  parents: Map<string, ParentEdge[]>;
  /** material\0product → 該邊的反應列表 */
  edgeReactions: Map<string, FusionReaction[]>;
  /** 圖上出現過的寵物名 */
  petNodes: Set<string>;
}

export interface FusionRootPath {
  root: string;
  /** 從 start 走到 root 時進入 root 的材料寵；start 即根時為 null */
  viaMaterial: string | null;
}

export function edgeKey(materialPet: string, productPet: string): string {
  return `${materialPet}\0${productPet}`;
}

/** 反應內容簽名（去重用；不含 id／source） */
export function reactionSignature(r: Pick<FusionReaction, 'materials' | 'products' | 'npc'>): string {
  const mats = r.materials
    .map((m) => `${m.kind}\t${m.symbol}\t${m.qty ?? ''}`)
    .sort()
    .join('|');
  const prods = r.products
    .map((p) => `${p.kind}\t${p.symbol}\t${p.qty ?? ''}\t${p.prob ?? ''}`)
    .sort()
    .join('|');
  return `${mats}#${prods}#${r.npc}`;
}

export function petSymbols(slots: FusionSlot[]): string[] {
  return slots.filter((s) => s.kind === 'pet' && s.symbol).map((s) => s.symbol);
}
