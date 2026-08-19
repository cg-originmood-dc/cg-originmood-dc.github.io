/**
 * 寵物快速搜尋用的索引（名稱＋種族＋圖片路徑）。
 *
 * 每隻寵物的詳情頁都掛了搜尋框，一千多隻的清單要是直接嵌進每一頁，
 * 光這份清單就會在 dist 裡複製一千多次。改成一支靜態端點、由前端第一次
 * 用到時才抓，全站只有一份，換頁還能吃瀏覽器快取。
 *
 * 欄位刻意縮寫（n/r/i），一千多筆下來省下來的體積不算少。
 */
import type { APIRoute } from 'astro';
import { listPets, petImagePath } from '../lib/pets';

export const GET: APIRoute = () => {
  const pets = listPets().map((p) => ({
    n: p.名稱,
    r: p.種族 ?? '',
    i: petImagePath(p.名稱, p.image),
  }));
  return new Response(JSON.stringify(pets), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
