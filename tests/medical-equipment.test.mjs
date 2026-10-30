import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

for (const [profession, earlier] of [['醫師', '4'], ['護士', '3']]) {
  test(`${profession}御用長袍上限為6，其他階級維持原值`, () => {
    const rows = parse(readFileSync(`content/data/${profession}裝備上限.csv`, 'utf8'), {columns:true, bom:true});
    const robe = rows.find(row => row.裝備 === '長袍');
    // 既有裝備表使用戰鬥系欄名：王宮＝資深、師範＝御用、大師＝名師。
    assert.deepEqual(robe, {裝備:'長袍', 見習:'2', 正式:'2', 王宮:earlier, 師範:'6', 大師:'7'});
  });
}
