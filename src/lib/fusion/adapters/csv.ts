/**
 * 來源：活動 寵物合成配方.csv（經 synthesis.listSynthesisRecipes）
 * 設計圖打包檔次在此展開為 OO設計圖A…E。
 */
import { createHash } from 'node:crypto';
import { listSynthesisRecipes } from '../../synthesis';
import type { FusionReaction, FusionSlot } from '../types';
import { expandDesignDrawingName } from '../blueprints';
import { normalizePetName } from '../names';

function reactionId(parts: string): string {
  return `csv:${createHash('sha1').update(parts).digest('hex').slice(0, 12)}`;
}

function pushItemMaterial(
  materials: FusionSlot[],
  name: string,
  qty?: number,
): void {
  const expanded = expandDesignDrawingName(name);
  for (const symbol of expanded) {
    materials.push({
      symbol,
      kind: 'item',
      ...(qty != null && expanded.length === 1 ? { qty } : {}),
    });
  }
}

export function adaptCsvReactions(): FusionReaction[] {
  const out: FusionReaction[] = [];

  for (const rec of listSynthesisRecipes()) {
    const materials: FusionSlot[] = [];
    for (const ing of rec.ingredients) {
      if (ing.type === 'pet' && ing.name) {
        materials.push({
          symbol: normalizePetName(ing.name),
          kind: 'pet',
          ...(ing.qty != null ? { qty: Number(ing.qty) } : {}),
          ...(ing.minLevel != null ? { minLevel: Number(ing.minLevel) } : {}),
          ...(ing.anyLevel ? { anyLevel: true } : {}),
        });
      } else if (ing.type === 'gold') {
        materials.push({
          symbol: ing.name || '金幣',
          kind: 'gold',
        });
      } else if (ing.name) {
        pushItemMaterial(
          materials,
          ing.name,
          ing.qty != null ? Number(ing.qty) : undefined,
        );
      }
    }

    const products: FusionSlot[] = [];
    if (rec.outcomes.length) {
      for (const o of rec.outcomes) {
        if (o.type === 'pet' && o.name) {
          products.push({
            symbol: normalizePetName(o.name),
            kind: 'pet',
            ...(o.prob ? { prob: o.prob } : {}),
            ...(o.qty != null ? { qty: o.qty } : {}),
          });
        } else if (o.type === 'item' && o.name) {
          // 產物側極少是打包設計圖；若有也展開
          for (const symbol of expandDesignDrawingName(o.name)) {
            products.push({
              symbol,
              kind: 'item',
              ...(o.prob ? { prob: o.prob } : {}),
              ...(o.qty != null ? { qty: o.qty } : {}),
            });
          }
        }
      }
    } else {
      for (const p of rec.productPets) {
        if (!p) continue;
        products.push({
          symbol: normalizePetName(p),
          kind: 'pet',
          ...(rec.productProb[p] ? { prob: rec.productProb[p] } : {}),
        });
      }
    }

    const petProducts = products.filter((p) => p.kind === 'pet');
    if (!petProducts.length) continue;

    // 材料寵物只有自己 → 產物自己：空轉跳過
    const petMats = materials.filter((m) => m.kind === 'pet');
    if (
      petProducts.length === 1 &&
      petMats.length > 0 &&
      petMats.every((m) => m.symbol === petProducts[0]!.symbol)
    ) {
      continue;
    }

    const npc = (rec.npc || '').replace(/^NPC：\s*/u, '').trim();
    const cleanNpc = npc === '公告未載明' ? '' : npc;

    const fingerprint = [
      materials.map((m) => `${m.kind}:${m.symbol}:${m.qty ?? ''}`).join(','),
      products.map((p) => `${p.kind}:${p.symbol}:${p.prob ?? ''}`).join(','),
      cleanNpc,
      rec.activityId,
    ].join('|');

    out.push({
      id: reactionId(fingerprint),
      source: 'csv',
      materials,
      products,
      npc: cleanNpc,
      meta: { activityId: rec.activityId },
    });
  }

  return out;
}
