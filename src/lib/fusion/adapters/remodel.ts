/**
 * 來源：初心改造（remodelVendorData，對應魔力豆知識一次整理）
 * 規則：產物 = 底寵 + 改造圖A + 改造圖B + …（grades 展開）
 */
import { createHash } from 'node:crypto';
import { listRemodelFusionRecipes } from '../../remodelVendor';
import type { FusionReaction, FusionSlot } from '../types';
import { normalizePetName } from '../names';

function reactionId(parts: string): string {
  return `remodel:${createHash('sha1').update(parts).digest('hex').slice(0, 12)}`;
}

export function adaptRemodelReactions(): FusionReaction[] {
  return listRemodelFusionRecipes().map((r) => {
    const product = normalizePetName(r.product);
    // 底寵不可走產物別名表（兔耳嚇人箱 ≠ 改造陰影）
    const base = r.basePet.trim();
    const materials: FusionSlot[] = [
      { symbol: base, kind: 'pet' },
      ...r.blueprintItems.map(
        (name): FusionSlot => ({ symbol: name, kind: 'item' }),
      ),
    ];
    const fingerprint = `${product}|${base}|${r.blueprintItems.join(',')}|${r.npc}`;
    return {
      id: reactionId(fingerprint),
      source: 'remodel' as const,
      materials,
      products: [{ symbol: product, kind: 'pet' as const }],
      npc: r.npc,
      meta: {
        grades: r.grades,
        quest: r.quest,
      },
    };
  });
}
