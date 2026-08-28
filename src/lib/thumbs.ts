import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 表格縮圖。優先使用 public/img/thumb/<同路徑但副檔名為 webp> 的靜態首幀，
 * 再找同路徑縮圖，兩者都沒有才退回原圖。
 *
 * GIF 的 WebP 首幀不是只有省流量：表格不可同時播放大量動畫，完整 GIF 僅供
 * hover 預覽。編輯者新增圖片後應跑 scripts/make_thumbs.py；缺檔時仍退回原圖，
 * 避免破圖，但效能檢查會抓出寵物清單的 GIF fallback。
 */
const cache = new Map<string, string>();

export function thumbOf(url: string): string {
  if (!url.startsWith('/img/')) return url;
  const hit = cache.get(url);
  if (hit !== undefined) return hit;

  const rel = url.slice('/img/'.length);
  const webpRel = rel.replace(/\.[^./]+$/, '.webp');
  const webp = `/img/thumb/${webpRel}`;
  if (existsSync(join(process.cwd(), 'public', 'img', 'thumb', webpRel))) {
    cache.set(url, webp);
    return webp;
  }
  const thumb = `/img/thumb/${rel}`;
  const answer = existsSync(join(process.cwd(), 'public', 'img', 'thumb', rel)) ? thumb : url;
  cache.set(url, answer);
  return answer;
}
