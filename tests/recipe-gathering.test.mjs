import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';

const read = name => parse(fs.readFileSync(`content/data/${name}.csv`, 'utf8'), { columns: true, bom: true, skip_empty_lines: true });
const { recipes } = JSON.parse(fs.readFileSync('content/data/料理採集篩選.json', 'utf8'));
const cooking = read('料理');

test('採集入口放在材料欄，不在料理名稱加上材料採集點文字', () => {
  const source = fs.readFileSync('src/components/DataTable.astro', 'utf8');
  assert(!source.includes('{value}・材料採集點'));
  assert(source.includes("dataset.name === '料理' && isMaterial"));
  assert(source.includes('target.items.includes(materialName)'));
  assert(source.includes('<a href={gatheringHref}'));
});

test('每道料理的採集關聯完整，精確指向現有採集物且不複製地點', () => {
  assert.deepEqual(recipes.map(r => r.name), cooking.map(r => r.名稱));
  for (const recipe of recipes) {
    assert.equal(new Set(recipe.targets.map(t => t.dataset)).size, recipe.targets.length);
    for (const target of recipe.targets) {
      const table = read(target.dataset);
      assert.equal(target.href, `/採集/${target.dataset}/`);
      assert.equal(new Set(target.items).size, target.items.length);
      for (const name of target.items) assert(table.some(row => row.物品名稱 === name), `${recipe.name}: ${name}`);
      assert.deepEqual(Object.keys(target).sort(), ['dataset', 'href', 'items']);
    }
    // 測試只檢查關聯是否漂移；建置時不重建關聯、不覆蓋人工資料。
    const expand = (name, trail = []) => {
      assert(!trail.includes(name), `前置料理循環: ${name}`);
      const row = cooking.find(r => r.名稱 === name);
      return row ? row.材料.split('、').flatMap(p => expand(p.replace(/\(\d+\)$/, ''), [...trail, name])) : [name];
    };
    assert.deepEqual([...new Set([...recipe.targets.flatMap(t => t.items), ...recipe.other])].sort(), [...new Set(expand(recipe.name))].sort());
  }
});

test('跨技能、前置料理與非採集材料均有保留', () => {
  const find = name => recipes.find(r => r.name === name);
  assert.deepEqual(find('燒雞').targets.find(t => t.dataset === '伐木').items, ['檸檬草']);
  assert.deepEqual(find('炒麵麵包').targets[0].items, ['小麥粉', '牛奶', '鹽', '海苔', '薑']);
  assert(find('漢堡').targets[0].items.includes('蕃茄'));
  assert(find('漢堡').other.includes('瓶子'));
  assert.deepEqual(find('白飯').targets, []);
});
