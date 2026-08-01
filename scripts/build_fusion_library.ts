/**
 * 髒來源 → 標準合成庫 JSON（只應在此腳本解析一次）
 *
 *   npm run fusion:build
 *
 * 輸出：content/data/generated/fusion-library.json
 * Astro / query 只讀該檔，禁止 runtime parse 寵物合成配方.csv。
 *
 * 不自動改 專屬寵物.csv／道具庫.csv；缺列請人工補資料後再 build。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildFusionLibraryFile } from '../src/lib/fusion/buildPipeline';
import { fusionLibraryPath } from '../src/lib/fusion/library';
import type { FusionNode } from '../src/lib/pets';

/**
 * 手寫樹：與 pets.ts WIND_APOSTLE_EXTRA.fusionTree 同構（generate 時編入庫）。
 */
function handwrittenTrees(): FusionNode[] {
  const wind: FusionNode = {
    type: 'pet',
    name: '風之使徒',
    target: true,
    npc: '大法師安蕾雅 @ 艾爾瑪城元素師家 (216.188) (5%)',
    children: [
      {
        type: 'pet',
        name: '天空元素使',
        npc: 'NPC: 愛卡勒恩 @ 寵物研究所 (15，8)',
        children: [
          { type: 'pet', name: '光精靈' },
          { type: 'item', name: '風元素之卵', qty: 3 },
          { type: 'item', name: '閃耀變異之源', qty: 10 },
          { type: 'item', name: '精靈王契約', qty: 100 },
        ],
      },
      { type: 'item', name: '風元素之卵', qty: 1 },
      { type: 'item', name: '閃耀變異之源', qty: 10 },
      { type: 'gold', name: '50,000G', countLabel: '金幣' },
    ],
  };
  return [wind];
}

const lib = buildFusionLibraryFile(() => handwrittenTrees());
const out = fusionLibraryPath();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(lib, null, 2)}\n`, 'utf8');

console.log(`[fusion:build] wrote ${out}`);
console.log(
  `[fusion:build] reactions=${lib.reactions.length} parentEdges=${lib.parentEdges.length}`,
  lib.sources,
);
