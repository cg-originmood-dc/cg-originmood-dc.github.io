/**
 * 合成圖公開 API
 *
 * 架構：
 *   npm run fusion:build（髒來源 → 合成庫 JSON）
 *   → compileFusionGraph() 只讀庫並索引
 *   → query 展樹
 *
 * 加新來源：adapter + buildPipeline 註冊 + 重跑 fusion:build。
 * 頁面禁止 import buildPipeline / adapters（會拉進 CSV parse）。
 */
export type {
  CompiledFusionGraph,
  FusionReaction,
  FusionRootPath,
  FusionSlot,
  FusionSource,
  ParentEdge,
  SymbolKind,
} from './types';
export { reactionSignature, edgeKey } from './types';
export { normalizePetName } from './names';
export {
  FUSION_LIBRARY_REL,
  FUSION_LIBRARY_VERSION,
  type FusionLibraryFile,
} from './library';
export {
  compileFusionGraph,
  setHandwrittenFusionTrees,
  resetFusionGraph,
  fusionGraphStats,
  indexFusionLibrary,
} from './compile';
export {
  buildFusionTreeFromGraph,
  expandFusionDown,
  findFusionRoots,
  findFusionRootPaths,
  getReactionsForProduct,
  listFusionParents,
} from './query';
