/**
 * 來源：軍方研究所（content/data/軍方研究所配方.csv，經 militaryLab 讀入）
 */
import { createHash } from 'node:crypto';
import { listMilitaryLabRecipes } from '../../militaryLab';
import type { FusionReaction } from '../types';
import { normalizePetName } from '../names';

function reactionId(parts: string): string {
  return `military:${createHash('sha1').update(parts).digest('hex').slice(0, 12)}`;
}

export function adaptMilitaryReactions(): FusionReaction[] {
  return listMilitaryLabRecipes().map((r) => {
    const product = normalizePetName(r.product);
    const base = normalizePetName(r.basePet);
    const materials = [
      { symbol: base, kind: 'pet' as const },
      ...r.materials.map((m) => ({
        symbol: m.name,
        kind: 'item' as const,
        qty: m.qty,
      })),
    ];
    const fingerprint = `${product}|${base}|${r.materials.map((m) => m.name + m.qty).join(',')}|${r.npc}`;
    return {
      id: reactionId(fingerprint),
      source: 'military' as const,
      materials,
      products: [{ symbol: product, kind: 'pet' as const }],
      npc: r.npc,
    };
  });
}
