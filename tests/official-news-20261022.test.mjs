import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'csv-parse/sync';

const read=name=>parse(fs.readFileSync(`content/data/${name}.csv`,'utf8'),{columns:true,bom:true,skip_empty_lines:true,relax_column_count:true});
const pets=read('專屬寵物');
const audit=JSON.parse(fs.readFileSync('content/data/公告寵物核對-20261022.json','utf8'));
test('9月以來20篇公告的60筆寵物均已收錄，公告入口存在',()=>{
 assert.equal(audit.articles.length,20);
 assert.equal(audit.articles.reduce((sum,a)=>sum+a.pets.length,0),60);
 const index=read('官方公告索引');
 for(const a of audit.articles){
  assert(index.some(r=>r.公告連結.includes(a.url)),a.id);
  assert(fs.existsSync(`content/公告存檔/${a.id}.md`),a.id);
  for(const name of a.pets)assert.equal(pets.filter(p=>p.名稱===name).length,1,name);
 }
});
test('補齊五隻新寵的能力、技能及靜態首幀縮圖',()=>{
 const expected={
  巫帽布偶兔:[31,6,10,28,50,8,125,'風10','潔淨魔法LV3、超強混亂魔法LV10、超強恢復魔法LV5、強力補血魔法LV6'],
  巨顎魔牙:[36,41,20,19,9,8,125,'水10','乾坤一擲LV11、氣功彈LV1、毒性攻擊LV12'],
  萬聖血手:[27,14,21,22,39,8,123,'水2火8','強力酒醉魔法LV7'],
  冰晶巨龍:[27,39,16,22,16,8,120,'水8風2','裂空斬LV10、連擊LV12'],
  冰晶暴龍王:[34,46,12,27,6,8,125,'水10','諸刃LV13、潛龍殺LV12、裂空斬LV10、連擊LV12']
 };
 for(const [name,values] of Object.entries(expected)){
  const p=pets.find(p=>p.名稱===name);assert(p,name);
  assert.deepEqual(['體力','力量','防禦','速度','魔法','技格','總檔','屬性','技能'].map(k=>p[k]),values.map(String));
  assert.equal(values.slice(0,5).reduce((a,b)=>a+b,0),values[6]);
  assert(fs.existsSync('public'+p.image));
  assert(fs.existsSync(`public/img/thumb/專屬寵物/${name}.webp`));
  assert(p.入手方法);assert(p.公告連結);
 }
 assert(pets.find(p=>p.名稱==='冰晶暴龍王').任務用途.includes('14，62'));
 assert.equal(pets.find(p=>p.名稱==='血面殭屍').技能,'乾坤一擲LV11');
 assert.equal(pets.find(p=>p.名稱==='星野海').力量,'44');
 assert(!pets.some(p=>p.名稱==='白曦南瓜怪'));
});
test('最新活動期間、夜晚接任座標、寶箱機率與歷年流程分開',()=>{
 const e=read('限時活動').find(e=>e.活動==='驚魂萬聖夜');
 assert.equal(e.開始,'2026-10-22 12:00');assert.equal(e.結束,'2026-11-05 12:00');
 assert.equal(e.頁面,'/任務攻略/限時活動/萬聖節狂歡');
 const page=fs.readFileSync('content/pages/任務攻略/限時活動/萬聖節狂歡.md','utf8');
 for(const s of ['155,29','夜晚','2025 年流程參考','白曦','白晝','14:00'])assert(page.includes(s),s);
 assert.equal([0.05,0.1,0.5,1,3.35,5,10,20,30,30].reduce((a,b)=>a+b,0),100);
 const ice=read('限時活動').find(e=>e.活動==='十月冰晶巨龍寶盒');
 assert.equal(ice.結束,'2026-11-11 12:00');
});
