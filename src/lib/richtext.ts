const MD_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/** 只做逃逸，其餘一律當純文字。CSV 是資料不是模板，不該能塞 HTML 進來。 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function hasLink(value: string): boolean {
  MD_LINK.lastIndex = 0;
  return MD_LINK.test(value);
}

/**
 * 把儲存格裡的 `[文字](網址)` 轉成連結，其餘內容逃逸後原樣輸出。
 *
 * 用 Markdown 語法而不是直接讓編輯者寫 HTML：一來跟 content/pages 的寫法一致，
 * 二來 CSV 進來的東西一律逃逸，不必擔心有人在試算表裡貼到奇怪的標籤。
 */
export function renderCell(value: string, base: string): string {
  let out = '';
  let last = 0;
  MD_LINK.lastIndex = 0;
  for (let m = MD_LINK.exec(value); m; m = MD_LINK.exec(value)) {
    out += escapeHtml(value.slice(last, m.index));
    const [, text, href] = m;
    const external = /^https?:\/\//.test(href);
    // 內容層的連結一律寫成 /... 絕對路徑，部署用的 base 在這裡才套上
    const url = external ? href : base + href;
    const extra = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    out += `<a href="${escapeHtml(url)}"${extra}>${escapeHtml(text)}</a>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(value.slice(last));
}
