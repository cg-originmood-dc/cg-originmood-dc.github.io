/**
 * 合成庫（中間 SSOT）—— 固定 JSON，給 build／頁面只讀。
 *
 * 路徑：content/data/generated/fusion-library.json
 * 產生：npm run fusion:build（scripts/build_fusion_library.ts）
 * 執行期禁止再跑 CSV／adapter parse。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FusionReaction, ParentEdge } from './types';

export const FUSION_LIBRARY_VERSION = 1 as const;

/** 相對於專案根的標準路徑 */
export const FUSION_LIBRARY_REL =
  'content/data/generated/fusion-library.json';

/** 寵物頁「相關合成活動」用（已從配方 CSV 抽出，執行期勿再 parse） */
export interface FusionActivityMeta {
  id: string;
  title: string;
  period: string;
  announcementDate: string;
  url: string;
  year: string;
}

/**
 * 落盤格式（純 JSON，無 Map／Set）
 * 查詢層只負責把 reactions／parentEdges 編成索引。
 */
export interface FusionLibraryFile {
  version: typeof FUSION_LIBRARY_VERSION;
  /** ISO 時間，僅供人讀 */
  generatedAt: string;
  /** 各來源反應筆數 */
  sources: Record<string, number>;
  /** 一級公民：全部合成反應（已 lower、已去重、寵物名已正規化） */
  reactions: FusionReaction[];
  /** 材料寵 → 產物寵（已拆互環）；可重算但落盤方便 diff／除錯 */
  parentEdges: ParentEdge[];
  /** 寵物名 → 相關活動（材料或產物有出現） */
  activitiesByPet: Record<string, FusionActivityMeta[]>;
}

export function fusionLibraryPath(cwd = process.cwd()): string {
  return join(cwd, FUSION_LIBRARY_REL);
}

export function loadFusionLibraryFile(cwd = process.cwd()): FusionLibraryFile {
  const path = fusionLibraryPath(cwd);
  if (!existsSync(path)) {
    throw new Error(
      `[fusion] 找不到合成庫 ${FUSION_LIBRARY_REL}\n` +
        `請先執行：npm run fusion:build\n` +
        `（髒來源只允許在該腳本解析一次並落盤，Astro 不得 runtime parse 配方 CSV。）`,
    );
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as FusionLibraryFile;
  if (raw.version !== FUSION_LIBRARY_VERSION) {
    throw new Error(
      `[fusion] 合成庫 version=${String(raw.version)} 與程式期望 ${FUSION_LIBRARY_VERSION} 不符，請重跑 npm run fusion:build`,
    );
  }
  if (!Array.isArray(raw.reactions) || !Array.isArray(raw.parentEdges)) {
    throw new Error(`[fusion] 合成庫格式損壞：缺少 reactions / parentEdges`);
  }
  if (!raw.activitiesByPet || typeof raw.activitiesByPet !== 'object') {
    raw.activitiesByPet = {};
  }
  return raw;
}
