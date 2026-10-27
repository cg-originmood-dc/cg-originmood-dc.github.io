import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const evidence = JSON.parse(readFileSync('content/data/技能說明佐證.json', 'utf8'));
test('飛刃亂舞採官方調整後的 35%，不附截圖或差異說明', () => {
  const entry = evidence.find(row => row.技能 === '飛刃亂舞');
  assert.equal(entry.適用, '人物');
  assert.equal(entry.標題, '技能說明');
  assert.equal(entry.描述, '隨機丟出複數的飛刃攻擊敵人，第一次造成的傷害約為攻擊力的 35%；如果目標再次受到飛刃的攻擊，傷害將遞增。');
  assert.equal(entry.圖片, undefined);
  assert.equal(entry.備註, undefined);
  assert(entry.來源網址.endsWith('mlbb_news_8774.html'));
});

test('技能佐證依技能及人物／寵物側顯示，不把人物倍率套到寵物', () => {
  const page = readFileSync('src/pages/skill/[scope]/[name].astro', 'utf8');
  assert(page.includes("entry.技能 === name && entry.適用 === (key === 'char' ? '人物' : '寵物')"));
  assert(!page.includes('entry.圖片'));
  assert(!page.includes('飛刃亂舞'));
});
