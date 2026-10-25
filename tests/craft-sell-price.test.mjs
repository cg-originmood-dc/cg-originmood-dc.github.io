import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parse} from 'csv-parse/sync';

const file = 'content/data/衣服.csv';
const options = {columns:true, bom:true, skip_empty_lines:true};
const rows = parse(readFileSync(file,'utf8'),options);
const field = '初心賣店價（G／件）';

test('只填入已確認的布甲單件640G，不推算其他價格', () => {
  assert.deepEqual(rows.filter(row=>row[field]).map(row=>[row.名稱,row[field]]), [['布甲','640']]);
  assert.equal(rows.find(row=>row.名稱==='布甲').販店價,'800');
});

test('新增初心價欄不變更既有配方、屬性或原版價格', () => {
  const old = parse(execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'}),options);
  const withoutConfirmedPrice = ({[field]: price,[`${field}佐證`]: evidence,['布料成本（G／件）']: cost,['布料成本（G／件）說明']: note,...row})=>row;
  assert.deepEqual(rows.map(withoutConfirmedPrice),old.map(withoutConfirmedPrice));
});

test('截圖附在價格同格，舊版販店價不再顯示', () => {
  assert.equal(rows.find(row=>row.名稱==='布甲')[`${field}佐證`], '[截圖](/img/存檔截圖/布甲-初心賣店價.png)');
  const table=readFileSync('src/components/DataTable.astro','utf8');
  assert(table.includes("c !== '販店價'"));
  assert(table.includes('row[`${c}佐證`]'));
  assert(!readFileSync('content/pages/生產製造/防具/衣服.md','utf8').includes('<summary>布甲賣店價格截圖</summary>'));
});

test('成本計算只使用初心已確認賣店價', () => {
  const source=readFileSync('src/lib/craftCost.ts','utf8');
  assert(source.includes("s: (r['初心賣店價（G／件）'] ?? '').trim()"));
  assert(!source.includes("s: (r['販店價']"));
  assert(readFileSync('src/components/CraftCostCalc.astro','utf8').includes('初心賣店價：'));
});
