import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('傳教士潔淨上限維持初心六級，兩處頁面註明版本差異', () => {
  const limits = readFileSync('content/data/傳教士魔法上限.csv', 'utf8');
  assert.match(limits, /^潔淨 魔法,4,4,5,6,6\r?$/m);
  const skills = readFileSync('content/data/技能總覽.csv', 'utf8');
  assert.match(skills, /^潔淨魔法,人物,戰鬥輔助魔法,10,傳教士在大宇版本的上限為 Lv7；永恆初心已調整為 Lv6。\r?$/m);
  const job = readFileSync('content/pages/職業總覽/法術系/傳教士.md', 'utf8');
  assert(job.includes('潔淨魔法上限：永恆初心為 Lv6，大宇版本為 Lv7'));
  const skillPage = readFileSync('src/pages/skill/[scope]/[name].astro', 'utf8');
  assert(skillPage.includes('{side.備註}'));
});
