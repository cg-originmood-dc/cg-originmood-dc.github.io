/**
 * 正規化合成途徑資料 adapter。
 *
 * 公告文字只在資料整理時解析一次；網站執行期只讀已確認角色與條件的三張表。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type {
  FusionLevelCondition,
  FusionReaction,
  FusionSlot,
  FusionSource,
  SymbolKind,
} from '../types';

const FILES = {
  pathways: '寵物合成途徑.csv',
  materials: '寵物合成途徑-材料.csv',
  products: '寵物合成途徑-產物.csv',
} as const;

interface PathwayRow {
  途徑: string;
  配方ID: string;
  材料規則: string;
  產物規則: string;
  規則備註: string;
  NPC: string;
  座標: string;
  前置任務: string;
  '活動／期別': string;
  公告連結: string;
  來源: string;
}

interface SlotRow {
  配方ID: string;
  順序: string;
  種類: string;
  名稱: string;
  名稱狀態: string;
  數量: string;
  機率?: string;
  等級條件: string;
  等級: string;
  條件備註: string;
  原文: string;
}

const SOURCE_MAP: Record<string, FusionSource> = {
  活動合成: 'csv',
  軍方研究所: 'military',
  寵物改造: 'remodel',
  手動補充: 'handwritten',
};
const KIND_MAP: Record<string, SymbolKind> = {
  寵物: 'pet',
  道具: 'item',
  金幣: 'gold',
};
const LEVEL_MAP: Record<string, FusionLevelCondition> = {
  任意: 'any',
  指定: 'exact',
  至少: 'minimum',
  原文待確認: 'source',
};
const MATERIAL_RULES = new Set(['同列共同投入', '無材料']);
const PRODUCT_RULES = new Set([
  '單一產物',
  '多產物機率分支',
  '多產物（關係未載明）',
]);
const NAME_STATUSES = new Set([
  '已對應寵物表',
  '已對應道具庫',
  '已定義',
  '來源原文',
]);

let cached: FusionReaction[] | null = null;
let cachedMtime = '';

function dataPath(file: string): string {
  return join(process.cwd(), 'content', 'data', file);
}

function readRows<T>(file: string): T[] {
  const path = dataPath(file);
  if (!existsSync(path)) throw new Error(`缺少合成途徑資料：${path}`);
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
    trim: true,
  }) as T[];
}

function fail(file: string, row: number, message: string): never {
  throw new Error(`${file} 第 ${row + 2} 列：${message}`);
}

function positiveNumber(
  raw: string,
  file: string,
  row: number,
  field: string,
): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    fail(file, row, `${field} 必須是正數，目前為「${raw}」`);
  }
  return value;
}

function slotFromRow(row: SlotRow, file: string, index: number): FusionSlot {
  const kind = KIND_MAP[row.種類];
  if (!kind) fail(file, index, `未知種類「${row.種類}」`);
  if (!row.名稱) fail(file, index, '名稱不可空白');
  if (!NAME_STATUSES.has(row.名稱狀態)) {
    fail(file, index, `未知名稱狀態「${row.名稱狀態}」`);
  }
  const validStatuses: Record<SymbolKind, Set<string>> = {
    pet: new Set(['已對應寵物表', '來源原文']),
    item: new Set(['已對應道具庫', '來源原文']),
    gold: new Set(['已定義']),
  };
  if (!validStatuses[kind].has(row.名稱狀態)) {
    fail(file, index, `種類「${row.種類}」不能使用名稱狀態「${row.名稱狀態}」`);
  }

  const levelCondition = row.等級條件
    ? LEVEL_MAP[row.等級條件]
    : undefined;
  if (row.等級條件 && !levelCondition) {
    fail(file, index, `未知等級條件「${row.等級條件}」`);
  }
  const level = positiveNumber(row.等級, file, index, '等級');
  if (level != null && !Number.isInteger(level)) {
    fail(file, index, `等級必須是正整數，目前為「${row.等級}」`);
  }
  if ((levelCondition === 'exact' || levelCondition === 'minimum') && level == null) {
    fail(file, index, `等級條件「${row.等級條件}」必須提供等級`);
  }
  if (level != null && levelCondition !== 'exact' && levelCondition !== 'minimum') {
    fail(file, index, `等級 ${level} 缺少「指定」或「至少」條件`);
  }

  const qty = positiveNumber(row.數量, file, index, '數量');
  if (row.機率) {
    const match = row.機率.match(/^(\d+(?:\.\d+)?)%$/u);
    const probability = match ? Number(match[1]) : Number.NaN;
    if (!Number.isFinite(probability) || probability <= 0 || probability > 100) {
      fail(file, index, `機率必須是 0～100 的百分比，目前為「${row.機率}」`);
    }
  }
  return {
    symbol: row.名稱,
    kind,
    ...(qty != null ? { qty } : {}),
    ...(row.機率 ? { prob: row.機率 } : {}),
    ...(levelCondition ? { levelCondition } : {}),
    ...(level != null ? { level } : {}),
    ...(row.條件備註 ? { conditionNote: row.條件備註 } : {}),
    ...(row.原文 ? { raw: row.原文 } : {}),
    ...(row.名稱狀態 ? { nameStatus: row.名稱狀態 } : {}),
  };
}

function groupedSlots(rows: SlotRow[], file: string): Map<string, FusionSlot[]> {
  const groups = new Map<string, Array<{ order: number; slot: FusionSlot }>>();
  const orders = new Map<string, Set<number>>();
  rows.forEach((row, index) => {
    if (!row.配方ID) fail(file, index, '配方ID不可空白');
    const order = positiveNumber(row.順序, file, index, '順序');
    if (order == null || !Number.isInteger(order)) {
      fail(file, index, `順序必須是正整數，目前為「${row.順序}」`);
    }
    const seen = orders.get(row.配方ID) ?? new Set<number>();
    if (seen.has(order)) fail(file, index, `配方 ${row.配方ID} 的順序 ${order} 重複`);
    seen.add(order);
    orders.set(row.配方ID, seen);
    const group = groups.get(row.配方ID) ?? [];
    group.push({ order, slot: slotFromRow(row, file, index) });
    groups.set(row.配方ID, group);
  });

  return new Map(
    [...groups].map(([id, slots]) => [
      id,
      slots.sort((a, b) => a.order - b.order).map((x) => x.slot),
    ]),
  );
}

function sourceUrl(markdown: string): string {
  return markdown.match(/\((https?:\/\/[^)]+)\)/u)?.[1] ?? '';
}

function displayNpc(row: PathwayRow): string {
  const npc = row.NPC.trim();
  const coords = row.座標.trim();
  if (!npc) return coords;
  if (!coords || npc.includes(coords)) return npc;
  return `${npc}（${coords}）`;
}

export function adaptPathwayReactions(): FusionReaction[] {
  const mtime = Object.values(FILES)
    .map((file) => `${file}:${statSync(dataPath(file)).mtimeMs}`)
    .join('|');
  if (cached && cachedMtime === mtime) return cached;

  const pathways = readRows<PathwayRow>(FILES.pathways);
  const materialRows = readRows<SlotRow>(FILES.materials);
  const productRows = readRows<SlotRow>(FILES.products);
  const materials = groupedSlots(materialRows, FILES.materials);
  const products = groupedSlots(productRows, FILES.products);
  const ids = new Set<string>();

  const out = pathways.map((row, index): FusionReaction => {
    const id = row.配方ID;
    if (!id) fail(FILES.pathways, index, '配方ID不可空白');
    if (ids.has(id)) fail(FILES.pathways, index, `配方ID「${id}」重複`);
    ids.add(id);
    const source = SOURCE_MAP[row.途徑];
    if (!source) fail(FILES.pathways, index, `未知途徑「${row.途徑}」`);
    if (!MATERIAL_RULES.has(row.材料規則)) {
      fail(FILES.pathways, index, `未知材料規則「${row.材料規則}」`);
    }
    if (!PRODUCT_RULES.has(row.產物規則)) {
      fail(FILES.pathways, index, `未知產物規則「${row.產物規則}」`);
    }
    const recipeMaterials = materials.get(id) ?? [];
    const recipeProducts = products.get(id) ?? [];
    if (row.材料規則 === '無材料' && recipeMaterials.length) {
      fail(FILES.pathways, index, `標為無材料但材料明細有 ${recipeMaterials.length} 筆`);
    }
    if (row.材料規則 !== '無材料' && !recipeMaterials.length) {
      fail(FILES.pathways, index, '標為共同投入但沒有材料明細');
    }
    if (!recipeProducts.length) fail(FILES.pathways, index, '沒有產物明細');
    if (row.產物規則 === '單一產物' && recipeProducts.length !== 1) {
      fail(FILES.pathways, index, `標為單一產物但有 ${recipeProducts.length} 筆產物`);
    }
    if (row.產物規則 !== '單一產物' && recipeProducts.length < 2) {
      fail(FILES.pathways, index, `標為多產物但只有 ${recipeProducts.length} 筆產物`);
    }
    if (
      row.產物規則 === '多產物機率分支' &&
      recipeProducts.some((product) => !product.prob)
    ) {
      fail(FILES.pathways, index, '機率分支的每項產物都必須提供機率');
    }
    if (
      row.產物規則 === '多產物（關係未載明）' &&
      recipeProducts.some((product) => product.prob)
    ) {
      fail(FILES.pathways, index, '關係未載明的產物不可混入推測機率');
    }

    return {
      id,
      source,
      materials: recipeMaterials,
      products: recipeProducts,
      npc: displayNpc(row),
      meta: {
        pathwayId: id,
        materialRule: row.材料規則,
        productRule: row.產物規則,
        ...(row.規則備註 ? { ruleNote: row.規則備註 } : {}),
        ...(row.前置任務 ? { quest: row.前置任務 } : {}),
        ...(row['活動／期別'] ? { activityId: row['活動／期別'] } : {}),
        ...(row.來源 ? { sourceRef: row.來源 } : {}),
        ...(sourceUrl(row.公告連結) ? { sourceUrl: sourceUrl(row.公告連結) } : {}),
      },
    };
  });

  for (const [id] of materials) {
    if (!ids.has(id)) throw new Error(`${FILES.materials} 引用了不存在的配方ID「${id}」`);
  }
  for (const [id] of products) {
    if (!ids.has(id)) throw new Error(`${FILES.products} 引用了不存在的配方ID「${id}」`);
  }

  cached = out;
  cachedMtime = mtime;
  return out;
}
