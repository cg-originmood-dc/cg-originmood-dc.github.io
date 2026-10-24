import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';

test('職業分頁合併顯示，但保留四組獨立門檻', () => {
  const rows = parse(fs.readFileSync('content/data/稱號職業群.csv', 'utf8'), {columns: true});
  assert.deepEqual([...new Set(rows.map(row => row.分頁))], ['戰鬥系', '生產／服務／採集']);
  assert.deepEqual(rows.filter(row => row.分頁 === '生產／服務／採集').map(row => row.職業群), ['生產系', '服務系', '採集系']);
  const component = fs.readFileSync('src/components/TitleReputation.astro', 'utf8');
  assert(!component.includes('<select data-track>'));
  assert(component.includes('role="tablist"'));
  assert(component.includes('rememberedTracks'));
});

const page = fs.readFileSync('content/pages/稱號與聲望.md', 'utf8');
test('規則與試算共用一個主選單入口，舊網址轉到規則章節', () => {
  assert.match(page, /title: "稱號與聲望"/);
  assert.match(page, /breadcrumb: \[\]/);
  assert(!fs.existsSync('content/pages/聲望規則.md'));
  assert(fs.readFileSync('astro.config.mjs', 'utf8').includes("'/聲望規則': '/稱號與聲望#overview'"));
  const component = fs.readFileSync('src/components/TitleReputation.astro', 'utf8');
  for (const anchor of ['overview', 'rules', 'spots', 'daily', 'tables', 'ladder', 'promote', 'calc']) {
    assert(component.includes(`id="${anchor}"`));
  }
  assert(component.includes('<slot name="rules-intro" />'));
  assert(!component.includes('稱號是時間鎖，每天把聲望額度打滿就是最快。'));
  const route = fs.readFileSync('src/pages/[...slug].astro', 'utf8');
  assert(route.includes(`hasProse && entry.data.title !== '稱號與聲望'`));
  assert(route.includes('slot="rules-intro"'));
});

test('區分初心與舊版，不將倍增上限推及所有職業', () => {
  for (const text of ['戰鬥系以每日 1,600 點', '9,600 是本站採用的累積值', '不能據此認定所有生產', '每日 800／累積 4,800', '不直接當成初心規則', '不受每日聲望上限限制']) assert(page.includes(text), text);
  assert(page.includes('b8c9f61f-d25d-44b9-9491-62b6a0e2019b'));
  assert(page.includes('mlbb_news_4323.html'));
  assert(page.includes('mlbb_news_5763.html'));
});

test('依玩家確認不收錄轉職段落，分享欄位不重複', () => {
  assert(!page.includes('轉職'));
  assert(!page.includes('shop-item.html?id=1313'));
  assert.equal((page.match(/imageWidth:/g) ?? []).length, 1);
  assert.equal((page.match(/imageHeight:/g) ?? []).length, 1);
});
