import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'csv-parse/sync';
const read = name => parse(fs.readFileSync(`content/data/${name}.csv`,'utf8'),{columns:true,bom:true,skip_empty_lines:true,relax_column_count:true});
const pets=read('專屬寵物');
test('兩篇新公告十二筆寵物不重複收錄',()=>{
 const audit=JSON.parse(fs.readFileSync('content/data/公告寵物核對-20261119.json','utf8'));
 assert.equal(audit.articles.length,2);
 assert.equal(audit.articles.reduce((n,a)=>n+a.pets.length,0),12);
 for(const a of audit.articles){
  assert(fs.existsSync(`content/公告存檔/${a.id}.md`));
  assert(read('官方公告索引').some(r=>r.公告連結.includes(a.url)));
  for(const name of a.pets)assert.equal(pets.filter(p=>p.名稱===name).length,1,name);
 }
});
test('四隻新寵檔次及圖像完整',()=>{
 const expected={感恩節大公雞:[47,40,5,28,5,125],芒芒鳥:[36,44,14,25,6,125],小印第鳥:[39,10,15,23,48,125],火妖鳥人:[18,16,10,39,40,123]};
 for(const [name,stats] of Object.entries(expected)){
  const p=pets.find(p=>p.名稱===name);
  assert.deepEqual(['體力','力量','防禦','速度','魔法','總檔'].map(k=>Number(p[k])),stats);
  const sum=stats.slice(0,5).reduce((a,b)=>a+b);
  if(name==='小印第鳥'){
   assert.equal(sum,135);
   assert(p.入手方法.includes('合計135、總檔標125'));
   assert(p.公告連結.includes('檔次疑義待確認'));
  } else assert.equal(sum,stats[5]);
  assert.equal(p.技格,'8');
  assert(p.技能 && p.入手方法);
  assert(fs.existsSync('public'+p.image));
  assert(fs.existsSync(`public/img/thumb/專屬寵物/${name}.webp`));
 }
 assert.equal(pets.find(p=>p.名稱==='小印第鳥').技能,'雲群的祈禱LV5、屬性反轉LV3、混亂衝擊波LV10');
});
test('本期活動與歷年流程分開，秘寶不擅自套用任務截止日',()=>{
 const events=read('限時活動');
 const event=events.find(e=>e.活動==='火雞農場');
 assert.equal(event.開始,'2026-11-19 12:00');assert.equal(event.結束,'2026-12-03 12:00');
 assert.equal(events.find(e=>e.活動==='感恩節勇者秘寶').結束,'');
 const page=fs.readFileSync('content/pages/任務攻略/限時活動/感恩節-失蹤的火雞.md','utf8');
 for(const text of ['50,64','歷年流程參考','本期公告未逐項確認','14:00','女媧重石 0.5%','技能護符兌換券（綁）8%'])assert(page.includes(text),text);
 assert.equal(page.split('取得氣味樣本瓶').length-1,1);
});
