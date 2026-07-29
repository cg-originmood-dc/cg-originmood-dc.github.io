/**
 * 來源：pets extras 手寫 fusionTree
 * 拆成「每層產物 → 直接材料」反應；不保留整棵覆蓋。
 */
import { createHash } from 'node:crypto';
import type { FusionNode } from '../../pets';
import type { FusionReaction, FusionSlot } from '../types';
import { normalizePetName } from '../names';

export type HandwrittenTreeProvider = () => FusionNode[];

function reactionId(parts: string): string {
  return `hand:${createHash('sha1').update(parts).digest('hex').slice(0, 12)}`;
}

function shallowSlots(nodes: FusionNode[]): FusionSlot[] {
  return nodes.map((n): FusionSlot => {
    if (n.type === 'pet' && n.name) {
      return {
        symbol: normalizePetName(n.name),
        kind: 'pet',
        ...(n.qty != null ? { qty: Number(n.qty) } : {}),
      };
    }
    if (n.type === 'gold') {
      return { symbol: n.name || '金幣', kind: 'gold' };
    }
    return {
      symbol: n.name,
      kind: 'item',
      ...(n.qty != null ? { qty: Number(n.qty) } : {}),
    };
  });
}

function walk(node: FusionNode, out: FusionReaction[]): void {
  if (node.type === 'pet' && node.name && node.children?.length) {
    const product = normalizePetName(node.name);
    const materials = shallowSlots(node.children);
    const npc = (node.npc || '').replace(/^NPC：\s*/u, '').trim();
    const fingerprint = `pet|${product}|${materials.map((m) => m.symbol).join(',')}|${npc}`;
    out.push({
      id: reactionId(fingerprint),
      source: 'handwritten',
      materials,
      products: [{ symbol: product, kind: 'pet' }],
      npc,
    });
  }

  if (node.heads?.length && node.children?.length) {
    const products: FusionSlot[] = [];
    for (const h of node.heads) {
      if (h.type === 'pet' && h.name) {
        const prob = h.countLabel?.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
        products.push({
          symbol: normalizePetName(h.name),
          kind: 'pet',
          ...(prob ? { prob: `${prob}%` } : {}),
        });
      } else if (h.type === 'item' && h.name) {
        const prob = h.countLabel?.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
        products.push({
          symbol: h.name,
          kind: 'item',
          ...(h.qty != null ? { qty: Number(h.qty) } : {}),
          ...(prob ? { prob: `${prob}%` } : {}),
        });
      }
    }
    if (products.some((p) => p.kind === 'pet')) {
      const materials = shallowSlots(node.children);
      const npc = (node.npc || '').replace(/^NPC：\s*/u, '').trim();
      const fingerprint = `multi|${products.map((p) => p.symbol).join(',')}|${materials.map((m) => m.symbol).join(',')}|${npc}`;
      out.push({
        id: reactionId(fingerprint),
        source: 'handwritten',
        materials,
        products,
        npc,
      });
    }
  }

  for (const h of node.heads ?? []) walk(h, out);
  for (const c of node.children ?? []) walk(c, out);
}

export function adaptHandwrittenReactions(
  provider: HandwrittenTreeProvider | null,
): FusionReaction[] {
  if (!provider) return [];
  const out: FusionReaction[] = [];
  for (const tree of provider()) {
    walk(tree, out);
  }
  return out;
}
