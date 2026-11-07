import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';

const read = name => parse(fs.readFileSync(`content/data/${name}.csv`, 'utf8'), { columns: true, bom: true, skip_empty_lines: true });
test('採集表與道具庫不再列未開放的布拉基姆高地、梅布爾隘地或法蘭城遺跡', () => {
  for (const name of ['狩獵', '伐木', '挖掘', '道具庫']) {
    const rows = read(name);
    for (const row of rows) for (const value of Object.values(row)) {
      assert.doesNotMatch(value, /布拉基姆高地|梅布爾隘地|法蘭城遺跡/, name);
      assert.doesNotMatch(value, /(?:^| \/ ) \/ | \/ $/, name);
    }
  }
});

test('保留其他地點與採集物；唯一建議點移除後不擅自替補', () => {
  const hunting = read('狩獵');
  for (const name of ['蔥', '辣椒', '咖哩塊']) {
    const row = hunting.find(row => row.物品名稱 === name);
    assert.equal(row.建議採集地點, '');
    assert(row.一般採集地點.length > 0);
  }
  for (const name of ['白菜', '鮭魚', '芝麻娃娃', '大豆']) {
    const row = hunting.find(row => row.物品名稱 === name);
    assert(row, name);
    assert.equal(row.一般採集地點, '');
    assert.equal(row.建議採集地點, '');
  }
  const pear = read('伐木').find(row => row.物品名稱 === '果梨');
  assert(pear.一般採集地點.includes('雷村點）(544,404)'));
  assert(pear.一般採集地點.includes('法蘭城西門外(510,127)'));
  const mint = read('伐木').find(row => row.物品名稱 === '蘋果薄荷');
  assert(mint.一般採集地點.includes('雷村點）(470,335)'));
  assert(mint.一般採集地點.includes('法蘭城西門外(500,85)'));
  assert(hunting.find(row => row.物品名稱 === '竹筍').一般採集地點.includes('庫魯克斯島橋後(408,695)'));
  const silver = read('挖掘').find(row => row.物品名稱 === '銀');
  assert.equal(silver.建議採集地點, '國營第24坑道B4(17,17)(27,21)附近(西北)');
});
