import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'dist');
const base = (process.argv[3] ?? '').replace(/\/$/, '');
const robotsTag = '<meta name="robots" content="noindex, nofollow, noarchive" />';
let htmlCount = 0;
let changedCount = 0;
let rebasedCount = 0;

if (!base.startsWith('/') || base === '') {
  throw new Error(`preview base 必須是非根目錄的絕對路徑：${base || '(empty)'}`);
}

function rebase(url) {
  if (url === base || url.startsWith(`${base}/`)) return url;
  rebasedCount += 1;
  return `${base}${url}`;
}

async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(filename);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.html') continue;

    htmlCount += 1;
    const html = await readFile(filename, 'utf8');
    let output = html;
    if (!/<meta\s+[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(output)) {
      output = output.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}\n    ${robotsTag}`);
      if (output === html) throw new Error(`找不到 <head>，無法加入 noindex：${filename}`);
    }

    // Astro 的 base 不會改寫所有元件直接輸出的根相對網址，preview 必須在成品層補齊。
    output = output.replace(
      /\b(href|src|action|poster|cite|formaction|data-href|data-src)=(["'])(\/(?!\/)[^"']*)\2/gi,
      (_match, attr, quote, url) => `${attr}=${quote}${rebase(url)}${quote}`,
    );
    // Astro 產生的靜態 redirect 把目的地放在 meta refresh 的 content，而不是 href。
    output = output.replace(
      /\bcontent=(["'])([^"']*?\burl=)(\/(?!\/)[^"']*)\1/gi,
      (_match, quote, prefix, url) => `content=${quote}${prefix}${rebase(url)}${quote}`,
    );

    if (output !== html) {
      await writeFile(filename, output);
      changedCount += 1;
    }
  }
}

await visit(root);
if (htmlCount === 0) throw new Error(`找不到任何 HTML：${root}`);
console.log(
  `PR preview protection: ${htmlCount} HTML checked, ${changedCount} files changed, ${rebasedCount} URLs rebased`,
);
