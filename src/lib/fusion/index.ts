/**
 * 合成圖公開 API
 *
 * 架構：
 *   各來源 adapter → FusionReaction[] → compile → CompiledFusionGraph
 *   → query（根／展樹）
 *
 * 加新來源：寫 adapter + 在 compile.collectAllReactions 註冊一行。
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
  compileFusionGraph,
  setHandwrittenFusionTrees,
  resetFusionGraph,
  fusionGraphStats,
} from './compile';
export type { HandwrittenTreeProvider } from './adapters/handwritten';
export {
  buildFusionTreeFromGraph,
  expandFusionDown,
  findFusionRoots,
  findFusionRootPaths,
  getReactionsForProduct,
  listFusionParents,
} from './query';
