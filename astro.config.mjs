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

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  markdown: {
    smartypants: false,
    rehypePlugins: [rehypeBasePath()],
  },
});
