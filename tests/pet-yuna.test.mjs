import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

test('小可愛優奈：一般寵物、五項28檔、總檔140、任務取得', () => {
  const read = file => parse(readFileSync(`content/data/${file}`, 'utf8'), { columns: true, skip_empty_lines: true, bom: true });
  const matches = read('魔力原始寵物.csv').filter(row => row.名稱 === '小可愛優奈');
  assert.equal(matches.length, 1);
  assert.equal(read('專屬寵物.csv').filter(row => row.名稱 === '小可愛優奈').length, 0);
  const pet = matches[0];
  const stats = ['體力', '力量', '防禦', '速度', '魔法'].map(key => Number(pet[key]));
  assert.deepEqual(stats, [28, 28, 28, 28, 28]);
  assert.equal(stats.reduce((sum, stat) => sum + stat, 0), Number(pet.總檔));
  assert.equal(pet.總檔, '140');
  assert.equal(pet.種族, '人形系');
  assert.equal(pet.屬性, '地5風5');
  assert.equal(pet.技格, '7');
  assert.equal(pet.入手類型, '任務');
  for (const source of ['cg.skyey.tw/errand/maaa31.htm', 'ibluecg.com/pet/?id=11', 'snA=3986']) {
    assert(pet.入手方法.includes(source));
  }
  const extra = JSON.parse(readFileSync('content/data/寵物詳情補充.json', 'utf8'))[pet.名稱];
  assert.equal(extra.sealable, false);
  assert.equal(extra.obtainMethods[0].coords, '216.124');
  assert(extra.obtainMethods[0].note.includes('流行手冊4本'));
});
