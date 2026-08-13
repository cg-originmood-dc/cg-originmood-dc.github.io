import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 內容層的契約。編輯者只需要維護 content/ 底下的檔案，
 * 這裡的 schema 會在 build 時驗證欄位，缺漏會直接讓 build 失敗而不是默默壞掉。
 */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/pages' }),
  schema: z.object({
    /** 頁面標題 */
    title: z.string(),
    /**
     * 這頁內容的出處，顯示在頁尾。多數是原 Google Sites 的對應頁，
     * 也可以是別的站（例如外站的配方表）。我們自己編的索引頁沒有出處，留空。
     */
    sourceUrl: z.string().url().optional(),
    /** 上層分類，用來組麵包屑與側邊導覽 */
    breadcrumb: z.array(z.string()).default([]),
    /** 這頁要渲染哪些 content/data/*.csv 資料集 */
    datasets: z.array(z.string()).default([]),
    /**
     * 選填：在資料表產品（名稱欄）下方標注材料欄各項的等級。
     * 等級照名稱查道具庫，介面不寫死任何品名；道具庫查不到或沒等級的材料不標。
     */
    materialLevels: z.boolean().default(false),
    /** 選填：手動排序權重，數字小的排前面 */
    order: z.number().optional(),
    /** 選填：從導覽隱藏 */
    draft: z.boolean().default(false),
  }),
});

export const collections = { pages };
