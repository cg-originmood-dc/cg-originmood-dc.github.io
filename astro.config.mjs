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
  '/生產製造/s階武器': '/生產製造/特殊製造/s階武器',
  '/生產製造/s階防具': '/生產製造/特殊製造/s階防具',
  '/生產製造/s階生產採集': '/生產製造/特殊製造/s階生產採集',
  '/生產製造/神器寵物裝備屬性': '/生產製造/特殊製造/神器寵物裝備屬性',
  '/生產製造/傳奇套裝': '/生產製造/特殊製造/傳奇套裝',
  '/生產製造/寶石袋': '/生產製造/特殊製造/寶石袋',
  // 技能在遊戲裡叫伐木，蔚藍那邊寫伐採
  '/採集/伐採': '/採集/伐木',
  // 寵物現在由合併清單統一入口；保留舊路徑相容既有連結
  '/專屬寵物': '/寵物清單',
  '/原生寵物': '/寵物清單',
  '/魔力原始寵物': '/寵物清單',
};

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  redirects: moved,
  markdown: {
    smartypants: false,
    rehypePlugins: [rehypeBasePath()],
  },
});
