// @ts-check
import { defineConfig } from 'astro/config';
import { visit } from 'unist-util-visit';

// GitHub Pages 設定：
//   使用者頁（<user>.github.io）或自訂網域 → BASE_PATH 留 '/'
//   專案頁（<user>.github.io/<repo>）      → BASE_PATH 設成 '/<repo>'
const site = process.env.SITE_URL ?? 'https://example.github.io';
const base = process.env.BASE_PATH ?? '/';

/**
 * 內容層（content/）的連結與圖片一律寫成 '/...' 絕對路徑，不含部署用的 base，
 * 這樣同一份內容可以部署到根目錄或子路徑。base 在這裡統一套上。
 */
function rehypeBasePath() {
  const prefix = base.replace(/\/$/, '');
  return () => (tree) => {
    if (!prefix) return;
    visit(tree, 'element', (node) => {
      for (const attr of ['href', 'src']) {
        const value = node.properties?.[attr];
        if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
          node.properties[attr] = prefix + value;
        }
      }
    });
  };
}

/**
 * 搬過位置的頁面。GitHub Pages 沒有伺服器端轉址，Astro 會產出一張 meta refresh 的
 * HTML 頂著，讓外面既有的連結還能到得了。搬頁面時記得補一筆。
 */
const moved = {
  s階武器: '特殊製造/s階武器',
  s階防具: '特殊製造/s階防具',
  s階生產採集: '特殊製造/s階生產採集',
  神器寵物裝備屬性: '特殊製造/神器寵物裝備屬性',
  傳奇套裝: '特殊製造/傳奇套裝',
  寶石袋: '特殊製造/寶石袋',
};

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  redirects: Object.fromEntries(
    Object.entries(moved).map(([from, to]) => [`/生產製造/${from}`, `/生產製造/${to}`]),
  ),
  markdown: {
    smartypants: false,
    rehypePlugins: [rehypeBasePath()],
  },
});
