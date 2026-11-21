import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('content/pages/任務攻略/魔力任務/失翼之龍.md', 'utf8');
const section = page.split('## 2. ')[1].split('## 3. ')[0];
const config = JSON.parse(fs.readFileSync('content/data/quest-maps/wingless-dragon.json', 'utf8'));

test('入口至歌姬的各次換圖都有抵達與出口座標，並連到對應地圖', () => {
  const assets = ['entrance', 'hall', 'courtyard-first', 'grave-first', 'courtyard-singer', 'singer'];
  let previous = -1;
  for (const name of assets) {
    const map = config.maps.find(m => m.assetName === name);
    const start = `(${map.points[0][0]},${map.points[0][1]})`;
    assert(section.includes(start), start);
    const destination = name === 'singer' ? '(24,23)' : `(${map.points[1][0]},${map.points[1][1]})`;
    const href = `/img/pages/任務攻略/魔力任務/失翼之龍/${name}.webp`;
    assert(section.includes(`${destination}\`](${href})`), destination);
    assert(fs.existsSync(`public${href}`));
    const at = section.indexOf(href);
    assert(at > previous, name);
    previous = at;
  }
  assert(!section.includes('先穿過入口與1樓'));
  assert(section.includes('交談，傳往龍之沙漏'));
});
