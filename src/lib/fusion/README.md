# 合成圖（Fusion Graph）

## 目標

三張正規化合成途徑表 → **統一 Reaction 結構** → 編譯成圖 → 查詢／展樹。
公告與攻略只在資料整理時解析一次；網站執行期不重新解析公式，也不靠名稱猜材料角色。

## 架構

```
adapters/pathways.ts  正規化三表 → FusionReaction[]
compile.ts            去重、建索引與明確循環群組
query.ts              全部根、完整向下展開與循環查詢
index.ts       公開 API
```

`../fusionGraph.ts` 為相容 re-export（舊 `FusionRecipe` 形狀可選）。

## 統一結構：`FusionReaction`

```ts
{
  id, source,           // csv | military | remodel | handwritten
  materials: [{ symbol, kind: pet|item|gold, qty?, levelCondition?, level? }],
  products:  [{ symbol, kind, prob?, levelCondition?, level? }],
  npc,
  meta?: { activityId?, grades?, quest? }
}
```

- **Parent 邊**（衍生）：材料寵 → 產物寵（`from ≠ to`，重抽自環不建）
- **全部配方**保留在 `byProduct`，禁止主配方勝負
- **循環群組**：明確材料寵 → 產物寵有向圖中，至少兩隻寵物互相可達的強連通分量
- 循環只表示配方關係互相可達，不推定重抽、進化、取得或主配方

## 加新來源

1. 在 `content/data/寵物合成途徑.csv` 新增配方與穩定 `配方ID`
2. 用同一 ID 在材料、產物明細表逐項定義角色、數量、等級條件與來源原文
3. 不要直接改 adapter、query 或 UI 特判某則公告
4. 不要因字面相近建立寵物別名；只有人工確認為同名異寫時才能對應

## 展樹規則

1. 從目前寵沿 parent 上溯祖先
2. 祖先中找**全部根**
3. 每根用對應反應向下 DFS；多反應 → 森林
4. 嵌套優先「取得線」（材料不含自己）
5. NPC 掛在**產物**名稱／機率下（多頭在 heads 上）
