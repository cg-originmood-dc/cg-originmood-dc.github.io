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
    /** 原始 Google Sites 對應頁面，全站都會顯示出處 */
    sourceUrl: z.string().url(),
    /** 上層分類，用來組麵包屑與側邊導覽 */
    breadcrumb: z.array(z.string()).default([]),
    /** 這頁要渲染哪些 content/data/*.csv 資料集 */
    datasets: z.array(z.string()).default([]),
    /** 選填：手動排序權重，數字小的排前面 */
    order: z.number().optional(),
    /** 選填：從導覽隱藏 */
    draft: z.boolean().default(false),
  }),
});

export const collections = { pages };
