import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

test('萬聖節列入限時練功路線並標示季節開啟及本期資訊', () => {
  const rows = parse(readFileSync('content/data/練功地點列表.csv', 'utf8'), { columns: true, bom: true, skip_empty_lines: true });
  const matches = rows.filter(r => r.地點 === '萬聖節狂歡');
  assert.equal(matches.length, 1);
  const row = matches[0];
  assert.equal(row.分區, '高手區');
  assert.equal(row.路線, '限時活動路線');
  assert.equal(row.標記, '季節開啟');
  assert(row.註.includes('2026/10/22 12:00～11/5 12:00'));
  assert(row.怎麼去.includes('(155,29)'));
  assert(row.怎麼去.includes('/任務攻略/限時活動/萬聖節狂歡/'));
  assert(existsSync('content/pages/任務攻略/限時活動/萬聖節狂歡.md'));
  assert(row.怪物等級.includes('2025 參考'));
  assert(row.進入條件.includes('僅活動期間開放'));
  assert.equal(row.適合等級, '90~110');
});
