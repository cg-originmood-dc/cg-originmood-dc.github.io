import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parse} from 'csv-parse/sync';
const files=['弓','投擲武器','小刀','頭盔','帽子','衣服','長袍','盾牌','靴子','鞋子'];
const options={columns:true,bom:true,skip_empty_lines:true};
const field='布料成本（G／件）';
const prices={麻布:20,木棉布:25,毛氈:29,棉:33,綿:33,細線:40};
const fabricNames=new Set([...Object.keys(prices),'絹布','白狼蛛絲','莎蓮娜線','傑諾瓦線','德特家的布','開米士毛線','細麻布','特勞倫之線','阿巴尼斯製的線','阿巴尼斯製的布']);
const read=name=>parse(readFileSync(`content/data/${name}.csv`,'utf8'),options);
test('完整布料小計：只採用五項已確認單價，含未知布料即留白',()=>{
  for(const file of files){
    for(const row of read(file)){
      const parsed=row.材料.split('、').map(part=>part.match(/^(.+)\((\d+)\)$/));
      const cloth=parsed.filter(Boolean).filter(part=>fabricNames.has(part[1]));
      const complete=parsed.every(Boolean)&&cloth.length>0&&cloth.every(part=>prices[part[1]]!==undefined);
      const expected=complete?String(cloth.reduce((sum,part)=>sum+Number(part[2])*prices[part[1]],0)):'';
      assert.equal(row[field],expected,`${file}/${row.名稱}`);
      if(complete)assert(row[field+'說明'].includes('只含布料'));
    }
  }
  const clothes=read('衣服');
  assert.equal(clothes.find(row=>row.名稱==='布甲')[field],'533');
  assert.equal(clothes.find(row=>row.名稱==='保護衣')[field],'110');
  assert.equal(clothes.find(row=>row.名稱==='士兵護衣')[field],'530');
  assert.equal(clothes.find(row=>row.名稱==='環服')[field],'398');
  assert.equal(clothes.find(row=>row.名稱==='功夫裝')[field],'');
  assert.equal(clothes.find(row=>row.名稱==='魔法之服')[field],'');
});
test('布料欄新增不變更其他配方或能力資料',()=>{
  const strip=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith('布料成本')&&!key.startsWith('初心賣店價')));
  for(const file of files){
    const before=parse(execFileSync('git',['show',`HEAD:content/data/${file}.csv`],{encoding:'utf8'}),options);
    assert.deepEqual(read(file).map(strip),before.map(strip),file);
  }
});
test('材料單價區分每個價格與40個堆疊',()=>{
  const rows=read('材料NPC售價');
  for(const name of ['麻布','木棉布','毛氈','棉','細線']){
    const row=rows.find(row=>row.名稱===name);
    assert.equal(Number(row.價格),prices[name]);
    assert.equal(row.確認日期,'2026-10-25');
  }
});
