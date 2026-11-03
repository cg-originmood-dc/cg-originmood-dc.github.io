import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('content/pages/任務攻略/魔力任務/沉默之龍.md', 'utf8');
const section = page.split('### 推薦水晶與打法')[1].split('<a href=')[0];

test('白銀騎士團三套合擊順序與玩家提供內容一致', () => {
  const orders = [...section.matchAll(/合擊順序：\*\*(.+?)\*\*/g)].map(match => match[1].split(' → '));
  assert.deepEqual(orders, [
    ['魔術師烏莉兒','劍士羅嚴','熊美','僧侶帕利耶','小烏','白銀之騎士豪爾','獵人凱傑爾'],
    ['劍士羅嚴','獵人凱傑爾','熊美','僧侶帕利耶','小烏','白銀之騎士豪爾','魔術師烏莉兒'],
    ['劍士羅嚴','獵人凱傑爾','小烏','魔術師烏莉兒','熊美','白銀之騎士豪爾','僧侶帕利耶'],
  ]);
  for (const order of orders) assert.equal(new Set(order).size, 7);
});

test('水晶及隊伍條件放在第二場頭目戰，保留第一場打法', () => {
  for (const text of ['推薦水晶：純地', 'W 站位', '可穿閃裝', '寵物均會高級戰慄襲心', '碾壓隊伍']) assert(section.includes(text), text);
  assert(page.indexOf('### 推薦水晶與打法') > page.indexOf('### 第二場頭目戰'));
  assert(page.includes('### 核心打法：先清小兵，再快速集火艾兒卡絲'));
});

test('兩場血量採用 2026-11-01 初心戰鬥參考，放在各自戰鬥段落', () => {
  // battle-actions-2026-11-01.jsonl 的 C 封包最大 HP 欄位；取百位約值。
  // 豪爾 16506–16642、羅嚴 8487–8520、凱傑爾 6636–6713、
  // 烏莉兒 7734–7869、帕利耶 6862–7005、熊美 7308–7449、小烏 14794–14937。
  const first = page.split('### 艾兒卡絲戰：')[1].split('## 10.')[0];
  const second = page.split('### 第二場頭目戰：')[1].split('### 推薦水晶與打法')[0];
  assert(first.includes('| 艾兒卡絲 | 1 | 80 | 約 14,200 |')); // 14153–14296
  assert.equal((first.match(/約 3,700～4,100/g) ?? []).length, 2); // 手下 3650–4073
  for (const [name, level, hp] of [
    ['白銀之騎士豪爾', 89, '16,600'], ['劍士羅嚴', 81, '8,500'],
    ['獵人凱傑爾', 81, '6,700'], ['魔術師烏莉兒', 81, '7,800'],
    ['僧侶帕利耶', 81, '6,900'], ['熊美', 81, '7,400'], ['小烏', 81, '14,900'],
  ]) assert(second.includes(`| ${name} | 1 | ${level} | 約 ${hp} |`), name);
  for (const fight of [first, second]) assert(fight.includes('初心參考血量（每名）'));
  assert(!page.includes('舊版概估'));
});
