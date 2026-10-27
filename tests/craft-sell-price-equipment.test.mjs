import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from 'csv-parse/sync';

const field = '初心賣店價（G／件）';
const options = { columns: true, bom: true, skip_empty_lines: true };
const cases = [
  ['鞋子', [['白金鞋', '8', '1200', '1500']]],
  ['帽子', [['軍帽', '8', '880', '1100'], ['羽毛帽', '9', '1440', '1800'], ['黃昏之帽', '10', '2320', '2900']]],
  ['弓', [['重弦弓', '8', '1680', '2100'], ['靈魂之弓', '9', '3360', '4200'], ['摘星之弓', '10', '4160', '5200']]],
  ['杖', [['天使之杖', '9', '1680', '2100']]],
  ['長袍', [['靈魂之袍', '10', '4160', '5200']]],
];

for (const [set, expected] of cases) {
  const file = `content/data/${set}.csv`;
  const rows = parse(readFileSync(file, 'utf8'), options);
  test(`${set}僅新增截圖確認的單件收購價與價格旁佐證`, () => {
    assert.deepEqual(rows.filter(row => row[field]).map(row => [row.名稱, row.等級, row[field], row.販店價]), expected);
    for (const row of rows) {
      const evidence = row[`${field}佐證`];
      if (!row[field]) { assert.equal(evidence, ''); continue; }
      const asset = evidence.match(/^\[截圖\]\((.+)\)$/)?.[1];
      assert(asset);
      assert(existsSync(`public${asset}`));
    }
  });
  test(`${set}既有列的配方、屬性、布料成本與原版售價不變`, () => {
    const old = parse(execFileSync('git', ['show', `HEAD:${file}`], {encoding:'utf8'}), options);
    const withoutPrice = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== field && key !== `${field}佐證`));
    for (const row of rows) {
      const before = old.find(previous => previous.名稱 === row.名稱 && previous.等級 === row.等級);
      assert(before, row.名稱);
      assert.deepEqual(withoutPrice(row), withoutPrice(before));
    }
  });
}
