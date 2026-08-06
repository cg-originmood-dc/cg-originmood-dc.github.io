/**
 * 合成圖公開 API
 *
 * 架構：
 *   正規化合成途徑三表 → FusionReaction[] → compile → CompiledFusionGraph
 *   → query（根／展樹）
 */
export type {
  CompiledFusionGraph,
  FusionReaction,
  FusionCycleGroup,
  FusionLevelCondition,
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
  resetFusionGraph,
  fusionGraphStats,
} from './compile';
export {
  buildFusionTreeFromGraph,
  expandFusionDown,
  findFusionRoots,
  findFusionRootPaths,
  getReactionsForProduct,
  getFusionCycleGroupForPet,
  listFusionParents,
} from './query';
