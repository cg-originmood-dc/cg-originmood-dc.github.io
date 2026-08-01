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

const lib = buildFusionLibraryFile();
const out = fusionLibraryPath();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(lib, null, 2)}\n`, 'utf8');

console.log(`[fusion:build] wrote ${out}`);
console.log(
  `[fusion:build] reactions=${lib.reactions.length} parentEdges=${lib.parentEdges.length}`,
  lib.sources,
);
