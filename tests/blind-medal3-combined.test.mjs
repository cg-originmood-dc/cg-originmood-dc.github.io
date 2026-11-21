import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';

const root = 'content/pages/任務攻略/魔力任務/';
const slug = '盲目之龍與三等勳章合解';
const guide = fs.readFileSync(`${root}${slug}.md`, 'utf8');

test('合解頁使用既有隱藏導覽設定，兩個原任務都有入口', () => {
  assert.match(guide, /^draft: true$/m);
  for (const name of ['盲目之龍', '三等勳章']) {
    const parent = fs.readFileSync(`${root}${name}.md`, 'utf8');
    assert(parent.includes(`](/任務攻略/魔力任務/${slug})`));
    assert(guide.includes(`](/任務攻略/魔力任務/${name})`));
  }
  assert.match(fs.readFileSync('src/lib/nav.ts', 'utf8'), /filter\(\(e\) => !e\.data\.draft\)/);
  const route = fs.readFileSync('src/pages/[...slug].astro', 'utf8');
  assert(!route.includes('entry.data.draft'), '隱藏頁仍應產生可連入的網址');
});

test('合解順序保留送藥往返、觸媒與三追前置，不宣稱已實跑', () => {
  const headings = [...guide.matchAll(/^## ([1-7])\. (.+)$/gm)];
  assert.deepEqual(headings.map((match) => +match[1]), [1, 2, 3, 4, 5, 6, 7]);
  for (const text of ['第一次雷村', '第一次麥尼村', '第二次雷村', '第二次麥尼村', '第三次雷村',
    '第二份特效藥', '再找月心交談', '解散隊伍，每人各自與席琳交談',
    '13,700～13,900', '13,200～13,400', '沙漏的碎片', '尚未整趟合解實跑',
    '先清小兵再打王', '每人交出**紅龍諾利的鱗片**']) assert(guide.includes(text), text);
  assert(!/MapTool|CgStairFinder|最短路線已確認/.test(guide));
});

test('第2節直接顯示三洞與麥尼村位置圖，點位與行程編號一致', () => {
  const section = guide.split('## 2. ')[1].split('## 3. ')[0];
  const imageAt = section.indexOf('/preview/blind-medal3-overview.webp');
  assert(imageAt > 0 && imageAt < section.indexOf('<details>'), '位置圖不能收在展開區');
  const config = JSON.parse(fs.readFileSync('content/data/maps/blind-medal3-overview.json', 'utf8'));
  assert.deepEqual(config.maps[0].points.map(p => p.slice(0, 2)), [
    [582, 521], [418, 254], [354, 630], [428, 682], [575, 379], [283, 437], [477, 526],
  ]);
  assert.deepEqual(config.maps[0].routes, [], '相對位置圖不捏造步行連線');
});

test('神殿地點座標連到對應房間地圖，各次回神殿都附受款處入口', () => {
  const links = [...guide.matchAll(/\[([^\]]+)\]\((\/img\/[^)]+)\)/g)];
  const expected = [
    ['(1,7)', '三等勳章/43750.webp'],
    ['(8,28)', '三等勳章/43753.webp'],
    ['(22,25)', '盲目之龍/donation.webp'],
    ['(16,13)', '三等勳章/43770.webp'],
    ['(48,7)', '盲目之龍/vestibule.webp'],
    ['(10,9)', '盲目之龍/temple-stairs.webp'],
    ['(67,16)', '盲目之龍/temple-2f.webp'],
    ['(19,10)', '盲目之龍/audience.webp'],
    ['(16,6)', '盲目之龍/saint-room.webp'],
    ['(51,22)', '盲目之龍/inner-temple.webp'],
    ['(14,24)', '盲目之龍/sanctuary.webp'],
    ['(12,4)', '三等勳章/43775.webp'],
    ['(58,14)', '三等勳章/43776.webp'],
    ['(10,12)', '三等勳章/43774.webp'],
    ['(9,7)', '三等勳章/43772.webp'],
    ['(6,9)', '三等勳章/43773.webp'],
  ];
  for (const [coord, image] of expected) {
    assert(links.some(([, label, href]) => label.includes(coord) && href.endsWith(image)), `${coord}: ${image}`);
  }
  for (const [, , href] of links) assert(fs.existsSync(`public${href}`), href);
  for (const n of [1, 4, 6]) {
    const section = guide.split(`## ${n}. `)[1].split('\n## ')[0];
    assert(section.includes('捐獻受款處入口 `(1,7)`'));
    assert(section.includes('護士千千 `(8,28)`'));
  }
});

test('拿第二份藥後，合解與三勳皆說明原路找醫師傳回捐獻處', () => {
  for (const name of [slug, '三等勳章']) {
    const page = fs.readFileSync(`${root}${name}.md`, 'utf8');
    const returnAt = page.indexOf('拿到藥後，沿[通路原路返回]');
    assert(returnAt > page.indexOf('藥棚 `(10,12)`'), name);
    const paragraph = page.slice(returnAt).split('\n')[0];
    assert(paragraph.includes('醫師瑟拉維 `(16,13)`'));
    assert(paragraph.includes('交談，就會傳回**捐獻受款處**'));
  }
});

test('所有地圖皆有可放大原圖，預覽尺寸正確', async () => {
  const images = [...guide.matchAll(/<a href="([^"]+)"><img src="([^"]+)"[^>]*width="(\d+)" height="(\d+)"[^>]*>/g)];
  assert(images.length >= 20);
  for (const [, href, src, width, height] of images) {
    assert.equal(href, src.replace('/preview/', '/'));
    assert(fs.existsSync(`public${href}`), href);
    const meta = await sharp(`public${src}`).metadata();
    assert.deepEqual([meta.width, meta.height], [+width, +height], src);
  }
});
