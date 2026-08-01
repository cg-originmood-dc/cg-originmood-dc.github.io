/**
 * 合成圖相容 re-export（實作在 src/lib/fusion/）
 *
 * 頁面／pets 請用 buildFusionTreeFromGraph；勿再走舊 CSV runtime 展樹。
 */
export {
  buildFusionTreeFromGraph,
  expandFusionDown,
  findFusionRoots,
  findFusionRootPaths,
  listFusionParents,
  setHandwrittenFusionTrees,
  resetFusionGraph,
  fusionGraphStats,
  getReactionsForProduct,
  compileFusionGraph,
  normalizePetName,
  type FusionReaction,
  type FusionRootPath,
  type CompiledFusionGraph,
} from './fusion';
