import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'csv-parse/sync';

const read = name => parse(fs.readFileSync(`content/data/${name}.csv`, 'utf8'), {columns:true,bom:true,skip_empty_lines:true});
const pets = read('專屬寵物');
const audit = JSON.parse(fs.readFileSync('content/data/公告寵物核對-20261113.json', 'utf8'));
test('近期八篇公告共十四筆寵物資料均已收錄，不重複新增返場寵', () => {
  assert.equal(audit.articles.length, 8);
  assert.equal(audit.articles.reduce((n,a) => n+a.pets.length,0),14);
  const index = read('官方公告索引');
  for (const a of audit.articles) {
    assert(index.some(r => r.公告連結.includes(a.url)));
    assert(fs.existsSync(`content/公告存檔/${a.id}.md`));
    for (const name of a.pets) assert.equal(pets.filter(p => p.名稱 === name).length,1,name);
  }
});
test('五隻新增寵物的官方配檔、技能、圖片及取得方式完整', () => {
  const expected = {
    黑耀飛龍: [24,36,24,19,17,120,'裂空斬LV10、連擊LV12'],
    黑耀帝龍: [31,50,10,28,6,125,'氣功彈LV3、連擊LV13、裂空斬LV10、乾坤一擲LV13'],
    大妖綠牛: [45,43,5,27,5,125,'連擊LV13、氣功彈LV4、裂空斬LV10'],
    大力地鼠: [32,45,19,19,10,125,'氣功彈LV2、乾坤一擲LV11'],
    黃錦雲傘: [26,16,19,23,39,123,'強力遺忘魔法LV5、混亂衝擊波LV3'],
  };
  assert.deepEqual(audit.added, Object.keys(expected));
  for (const [name,values] of Object.entries(expected)) {
    const p = pets.find(p => p.名稱 === name);
    assert.deepEqual(['體力','力量','防禦','速度','魔法','總檔','技能'].map(k => p[k]),values.map(String));
    assert.equal(values.slice(0,5).reduce((a,b) => a+b,0),values[5]);
    assert.equal(p.技格,'8');
    assert(p.入手方法 && p.入手類型 && p.公告連結);
    assert(fs.existsSync('public'+p.image));
    assert(fs.existsSync(`public/img/thumb/專屬寵物/${name}.webp`));
  }
  const dragon = pets.find(p => p.名稱 === '黑耀帝龍');
  assert(dragon.入手方法.includes('帝龍之魂×3'));
  assert(dragon.入手方法.includes('召喚書0.1%'));
  assert(pets.find(p => p.名稱 === '大妖綠牛').任務用途.includes('53，32'));
});
