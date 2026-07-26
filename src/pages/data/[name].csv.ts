/**
 * 把 `content/data/*.csv` **原封不動**發布成靜態檔。
 *
 * 站台本身只在 build 時把 CSV 讀進來渲染成表格（`lib/datasets.ts`），
 * CSV 不會進 `dist/`。這條路由補上那一塊，讓外部程式也能直接抓同一份資料：
 *
 *     https://cg-originmood-dc.github.io/data/專屬寵物.csv
 *
 * ## 為什麼不是把檔案複製到 `public/`
 *
 * **原檔只能有一份。** 複製到 `public/` 等於同一份資料存在兩個地方，
 * 編輯者改了 `content/data/` 那份、忘了同步 `public/` 那份，外部拿到的就是舊資料
 * —— 而且不會有任何東西報錯。這裡是 build 時從**同一個檔案**讀出來直接吐，
 * 沒有第二份，也沒有同步這回事。
 *
 * 清單走 `listDatasets()`（跟站台自己列資料集用的是同一支），所以編輯者新增一個
 * CSV 就自動跟著發布，不用回來改這裡。
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listDatasets } from '../../lib/datasets';

const DATA_DIR = join(process.cwd(), 'content', 'data');

export const getStaticPaths: GetStaticPaths = () =>
    listDatasets().map((name) => ({ params: { name } }));

export const GET: APIRoute = ({ params }) => {
    // 路徑只可能是 getStaticPaths 給的那些名字，但還是擋一下分隔符，
    // 免得哪天改成 SSR 就變成任意讀檔。
    const name = params.name ?? '';
    if (!name || /[\\/]/.test(name) || !listDatasets().includes(name)) {
        return new Response('not found', { status: 404 });
    }

    // 原樣送出，連 BOM 都留著 —— 這條路由的賣點就是「跟原檔一個位元組不差」。
    // 消費端該自己吃掉 BOM（站台自己的 loadDataset() 也是這樣做的）。
    return new Response(readFileSync(join(DATA_DIR, `${name}.csv`)), {
        headers: { 'content-type': 'text/csv; charset=utf-8' },
    });
};
