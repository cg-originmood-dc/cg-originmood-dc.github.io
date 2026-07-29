import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCollection, type CollectionEntry } from 'astro:content';

export interface NavNode {
  label: string;
  href: string | null;
  children: NavNode[];
}

/** 首頁在資料層叫「首頁」，網站根目錄直接渲染它 */
export const HOME_ID = '首頁';

export function hrefFor(id: string): string {
  return id === HOME_ID ? '/' : `/${id}`;
}

/**
 * 原站左側導覽的項目順序（由 scripts/extract.py 抓下來）。
 * 那個順序是人工排的，照字典序排會跟原站差很多，所以照抄。
 * 想改順序就改這個檔，或在頁面 frontmatter 指定 order。
 */
function navOrder(): Map<string, number> {
  const file = join(process.cwd(), 'content', 'nav-order.json');
  if (!existsSync(file)) return new Map();
  const labels = JSON.parse(readFileSync(file, 'utf8')) as string[];
  return new Map(labels.map((l, i) => [l, i]));
}

/**
 * 用每頁 frontmatter 的 breadcrumb 組出導覽樹。
 * 分類不需要另外維護一份設定檔 —— 目錄結構就是導覽結構。
 */
export async function buildNav(): Promise<NavNode[]> {
  const entries = (await getCollection('pages')).filter((e) => !e.data.draft);
  const order = navOrder();

  const roots: NavNode[] = [];
  const find = (list: NavNode[], label: string): NavNode => {
    let node = list.find((n) => n.label === label);
    if (!node) {
      node = { label, href: null, children: [] };
      list.push(node);
    }
    return node;
  };

  for (const entry of entries) {
    // 首頁另外 prepend 到最上方，不走 breadcrumb 樹
    // （content/pages/index.md 標題也是「首頁」，一併略過避免重複）
    if (entry.id === HOME_ID || entry.data.title === HOME_ID) continue;
    let level = roots;
    for (const crumb of entry.data.breadcrumb) {
      level = find(level, crumb).children;
    }
    const leaf = find(level, entry.data.title);
    leaf.href = hrefFor(entry.id);
  }

  // frontmatter 的 order 優先，其次是原站導覽順序，都沒有的才照筆劃排
  const rank = new Map<string, number>();
  for (const e of entries) rank.set(e.data.title, e.data.order ?? Infinity);
  const collator = new Intl.Collator('zh-Hant');
  const sortTree = (list: NavNode[]) => {
    list.sort((a, b) => {
      const ea = rank.get(a.label) ?? Infinity;
      const eb = rank.get(b.label) ?? Infinity;
      if (ea !== eb) return ea - eb;
      const na = order.get(a.label) ?? Infinity;
      const nb = order.get(b.label) ?? Infinity;
      if (na !== nb) return na - nb;
      return collator.compare(a.label, b.label);
    });
    list.forEach((n) => sortTree(n.children));
  };
  sortTree(roots);

  // 首頁固定放在導覽最上方
  const homeEntry = entries.find((e) => e.id === HOME_ID);
  if (homeEntry) {
    roots.unshift({
      label: homeEntry.data.title,
      href: hrefFor(HOME_ID),
      children: [],
    });
  }

  return roots;
}

export function titleOf(entry: CollectionEntry<'pages'>): string {
  return entry.data.title;
}
