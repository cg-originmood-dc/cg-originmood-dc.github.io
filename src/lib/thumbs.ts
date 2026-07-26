import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 表格縮圖。有 public/img/thumb/<同路徑> 就用它，沒有就退回原圖。
 *
 * 縮圖是選擇性的：編輯者新增一張圖而沒跑 scripts/make_thumbs.py，
 * 頁面照樣正常，只是那一張會載得比較肥。不會因為缺檔就破圖。
 */
const cache = new Map<string, string>();

export function thumbOf(url: string): string {
  if (!url.startsWith('/img/')) return url;
  const hit = cache.get(url);
  if (hit !== undefined) return hit;

  const rel = url.slice('/img/'.length);
  const thumb = `/img/thumb/${rel}`;
  const answer = existsSync(join(process.cwd(), 'public', 'img', 'thumb', rel)) ? thumb : url;
  cache.set(url, answer);
  return answer;
}
