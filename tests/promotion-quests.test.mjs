import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

const read = path => readFileSync(path, 'utf8');
const root = 'content/pages/任務攻略/晉階任務';
const rows = parse(read('content/data/晉階條件.csv'), { columns: true });

test('晉階任務有獨立分類、首頁入口與兩篇攻略', () => {
  assert.match(read(`${root}.md`), /title: "晉階任務"/);
  for (const name of ['生產系資深', 's階提升任務']) {
    assert.match(read(`${root}/${name}.md`), /  - "晉階任務"/);
    assert(read('content/pages/任務攻略.md').includes(`/任務攻略/晉階任務/${name}`));
  }
  const order = JSON.parse(read('content/nav-order.json'));
  for (const title of ['晉階任務', '生產系資深－起司任務', 'S階提升任務']) {
    assert.equal(order.filter(x => x === title).length, 1);
  }
});

test('S階搬頁保留舊網址轉址及四張既有圖片', () => {
  assert(!existsSync('content/pages/任務攻略/專屬任務/s階提升任務.md'));
  assert(read('astro.config.mjs').includes("'/任務攻略/專屬任務/s階提升任務': '/任務攻略/晉階任務/s階提升任務'"));
  const page = read(`${root}/s階提升任務.md`);
  for (let i = 1; i <= 4; i++) {
    const asset = `/img/pages/任務攻略/專屬任務/s階提升任務/${i}.png`;
    assert(page.includes(asset));
    assert(existsSync(`public${asset}`));
  }
});

test('晉階條件連到新攻略，醫護資深仍為神獸', () => {
  const cheese = rows.filter(r => r.任務 === '起司任務');
  assert.equal(cheese.length, 1);
  assert.equal(cheese[0].連結, '/任務攻略/晉階任務/生產系資深');
  const flowers = rows.filter(r => r.任務 === '誓言之花');
  assert.equal(flowers.length, 7);
  for (const row of flowers) assert.equal(row.連結, '/任務攻略/晉階任務/s階提升任務');
  assert.equal(rows.find(r => r.晉階 === '資深' && r.適用職業 === '醫生 / 護士').任務, '神獸');
});

test('起司攻略含交件計時、升階收尾與參考來源', () => {
  const page = read(`${root}/生產系資深.md`);
  for (const text of ['醫生與護士除外', 'R6', '踏入神的領域', '10,000G', '51,34', '56,48', '38,59', '買起司 → 約 1 小時後買酒 → 再約 1 小時後交件', '原本的就職 NPC', 'bsn=2577&sn=187', 'bsn=70151&snA=3219']) assert(page.includes(text), text);
  assert(!/合格範圍|前後 1 分鐘|取得起司約 2 小時/.test(page));
  assert(!/MapTool|本機資料/.test(page));
});
