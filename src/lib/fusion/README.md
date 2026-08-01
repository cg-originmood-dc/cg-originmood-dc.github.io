# 合成圖（Fusion Graph）

## 目標

多來源髒資料 → **統一 Reaction 結構** → 編譯成圖 → 查詢／展樹。  
之後**只加資料 + adapter**，不要在 UI 或 expand 旁路塞邏輯。

## 架構

```
adapters/*     各來源 → FusionReaction[]
compile.ts     去重、建 byProduct / parents / edgeReactions
query.ts       全部根、完整向下展開（不挑主配方）
index.ts       公開 API
```

`../fusionGraph.ts` 為相容 re-export（舊 `FusionRecipe` 形狀可選）。

## 統一結構：`FusionReaction`

```ts
{
  id, source,           // csv | military | remodel | handwritten
  materials: [{ symbol, kind: pet|item|gold, qty? }],
  products:  [{ symbol, kind, prob? }],
  npc,
  meta?: { activityId?, grades?, quest? }
}
```

- **Parent 邊**（衍生）：材料寵 → 產物寵（`from ≠ to`，重抽自環不建）
- **全部配方**保留在 `byProduct`，禁止主配方勝負

## 加新來源

1. 準備靜態資料（CSV / `*Data.ts`，勿 runtime 重讀 MD）
2. 新增 `adapters/foo.ts` → `adaptFooReactions(): FusionReaction[]`
3. 在 `compile.ts` 的 `collectAllReactions()` 加一行
4. 別名寫入對應表並在 `names.ts` 合併（注意：底寵名不可當產物異名）

## 展樹規則

1. 從目前寵沿 parent 上溯祖先
2. 祖先中找**全部根**
3. 每根用對應反應向下 DFS；多反應 → 森林
4. 嵌套優先「取得線」（材料不含自己）
5. NPC 掛在**產物**名稱／機率下（多頭在 heads 上）
