# 合成庫（Fusion Library）

## 原則（強制）

1. **髒來源只解析一次**，寫入標準中間檔
   `content/data/generated/fusion-library.json`
2. **Astro／寵物頁只讀該檔**，禁止 runtime parse `寵物合成配方.csv` 來展樹
3. 新來源：adapter → 註冊 `buildPipeline.collectAllReactions` → `npm run fusion:build`
4. **圖論視圖**：庫是圖（reaction 超邊）；展樹同一 `reaction.id` 子結構只建一次（DAG memo），禁止相同子樹複製貼上

## 效能

| 項目 | 量級（約） |
|------|------------|
| 合成庫檔 | ~0.5 MB |
| 反應／邊 | 數百條 |
| 讀庫 + 建索引 | 建頁時一次，~20ms |
| 全寵展樹 | 合計通常 <100ms |

展樹只在 **Astro SSG 建頁**做，不是瀏覽器每次 request 重算；memo 只減工作量、不加重 loading。

## 管線

```
寵物合成配方.csv / military / remodel / 手寫
  → adapters（僅 scripts/build_fusion_library.ts）
  → FusionReaction[] + parentEdges
  → content/data/generated/fusion-library.json   ← SSOT
  → compileFusionGraph() 建索引
  → query：上溯全部根 → 向下完整 DFS
  → 寵物頁 FusionTree
```

## 中間檔格式

```ts
{
  version: 1,
  generatedAt: string,
  sources: { csv?: number, military?: number, ... },
  reactions: FusionReaction[],  // 一級公民
  parentEdges: ParentEdge[],    // 材料寵 → 產物寵
  activitiesByPet: { [pet: string]: ActivityMeta[] }
}
```

## 指令

```bash
npm run fusion:build   # 重產合成庫（改配方／adapter 後必跑）
npm run build          # 會先 fusion:build 再 astro build
```

`fusion:build` **不會**改 `專屬寵物.csv`／`道具庫.csv`。
一次性補主表缺列的工具在工作區沙盒：
`魔力資料分析資料夾/02-爬蟲與工具腳本/fusion-init/`（不進本 repo）。

### 跨來源去重

`buildPipeline.dedupeReactions` 用**粗簽名**（略金幣／數量／等級／NPC）合併同配方線：

| 優先 | 來源 | 說明 |
|------|------|------|
| 高 | `handwritten` | 已確認模板（如風之使徒） |
| | `csv` | 官方公告，常含金幣／Lv |
| | `military` | 軍方研究所 |
| 低 | `remodel` | 豆知識改造；與 CSV 同線時丟棄（避免改造地獄骷髏雙份） |


## 加新來源

1. 靜態資料 + `adapters/foo.ts` → `FusionReaction[]`
2. `buildPipeline.collectAllReactions()` 加一行
3. `npm run fusion:build`，commit 更新後的 `fusion-library.json`
