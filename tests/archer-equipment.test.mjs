import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'csv-parse/sync';

test('弓箭手師範裝備上限符合 2026-10-18 玩家遊戲截圖',()=>{
 const rows=parse(fs.readFileSync('content/data/弓箭手裝備上限.csv','utf8'),{columns:true,bom:true,skip_empty_lines:true});
 const expected={長劍:'4',手斧:'4',槍矛:'4',法杖:'-',弓箭:'10',小刀:'6',投具:'6',太刀:'4',盾牌:'4',頭盔:'4',帽子:'10',鎧甲:'4',衣服:'10',長袍:'-',長靴:'4',鞋子:'10'};
 assert.equal(rows.length,Object.keys(expected).length);
 for(const row of rows){
  assert.equal(row.師範,expected[row.裝備],row.裝備);
  assert.equal(row.師範備註圖,'/img/pages/職業總覽/戰鬥系/弓箭手/裝備上限-師範-20261018.png');
  assert(fs.existsSync('public'+row.師範備註圖));
 }
});

test('S階數值對應大師欄，備註附上原始截圖',()=>{
 const rows=parse(fs.readFileSync('content/data/弓箭手裝備上限.csv','utf8'),{columns:true,bom:true,skip_empty_lines:true});
 const expected={長劍:'4',手斧:'4',槍矛:'4',法杖:'-',弓箭:'12',小刀:'7',投具:'7',太刀:'4',盾牌:'4',頭盔:'4',帽子:'12',鎧甲:'4',衣服:'12',長袍:'-',長靴:'4',鞋子:'12'};
 for(const row of rows){
  assert.equal(row.大師,expected[row.裝備],row.裝備);
  assert.equal(row.S階備註圖,'/img/pages/職業總覽/戰鬥系/弓箭手/裝備上限-S階-20261018.png');
  assert(fs.existsSync('public'+row.S階備註圖));
 }
});
