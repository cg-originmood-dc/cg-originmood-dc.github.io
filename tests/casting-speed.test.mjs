import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'csv-parse/sync';
import sharp from 'sharp';

const rows = parse(fs.readFileSync('content/data/人物施法速度.csv', 'utf8'), {columns:true, skip_empty_lines:true});

test('施法表收錄 42 種造型，保留來源的施法幀數與順序', () => {
  const frames = [26,32,33,33,33,33,34,39,39,40,40,49,49,50,50,51,58,62,64,66,66,67,67,68,69,69,69,69,69,70,70,72,72,72,72,72,74,75,78,80,81,81];
  assert.equal(rows.length, 42);
  assert.equal(new Set(rows.map(r => r.角色造型)).size, 42);
  assert.deepEqual(rows.map(r => Number(r.序號)), Array.from({length:42}, (_, i) => i+1));
  assert.deepEqual(rows.map(r => Number(r.施法幀數)), frames);
  for (const row of rows) assert.equal(row.每百秒施法次數, (3000 / Number(row.施法幀數)).toFixed(2));
  assert.equal(rows[0].角色造型, '麗2.0');
  assert.equal(rows.at(-1).角色造型, '荷蜜');
});

test('造型圖全部使用本地靜態 WebP，總量小於 150 KB', async () => {
  let total = 0;
  for (const row of rows) {
    assert.match(row.造型圖, /^\/img\/pages\/魔力豆知識\/施法速度\/\d+\.webp$/);
    const file = 'public' + row.造型圖;
    const meta = await sharp(file).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.pages ?? 1, 1);
    assert(meta.width > 0 && meta.height > 0);
    total += fs.statSync(file).size;
  }
  assert(total < 150_000);
});

test('豆知識連至表格頁，保留舊資料來源與適用範圍', () => {
  const index = fs.readFileSync('content/pages/魔力豆知識.md', 'utf8');
  const page = fs.readFileSync('content/pages/魔力豆知識/人物施法速度表.md', 'utf8');
  assert(index.includes('href="/魔力豆知識/人物施法速度表"'));
  assert.match(page, /datasets:\s*\n\s*- "人物施法速度"/);
  assert(page.includes('c61a9170-1f22-4295-8a6f-856aa2b90a3a'));
  assert(page.includes('2015 年'));
  assert(page.includes('尚未以永恆初心逐一實測'));
  assert(page.includes('不是敏捷或戰鬥出手順序'));
});
