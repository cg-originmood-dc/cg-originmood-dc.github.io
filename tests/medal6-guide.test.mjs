import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';

const route='/任務攻略/魔力任務/六等勳章';
const guide=fs.readFileSync(`content/pages${route}.md`,'utf8');
const config=JSON.parse(fs.readFileSync('content/data/quest-maps/medal6.json','utf8'));
const format=n=>n.toLocaleString('en-US');

test('六勳串接勳章系列，六步涵蓋接任、兩條分支及戰後領獎',()=>{
 for(const file of ['蘭國及艾爾巴勳章系列','七等勳章','五等勳章'])assert(fs.readFileSync(`content/pages/任務攻略/魔力任務/${file}.md`,'utf8').includes(`](${route})`));
 assert(fs.readFileSync('content/pages/任務攻略.md','utf8').includes(`href="${route}"`));
 const nav=JSON.parse(fs.readFileSync('content/nav-order.json','utf8'));
 assert(nav.indexOf('七等勳章－人魚之淚')<nav.indexOf('六等勳章－暗殺犯追跡'));
 assert(nav.indexOf('六等勳章－暗殺犯追跡')<nav.indexOf('五等勳章－大樹調查'));
 assert.equal([...guide.matchAll(/^## /gm)].length,6);
 for(const text of ['(38,26)','(14,12)','(386,329)','12 層隨機迷宮','木之鑰匙','(20,31)','選「是」','選「否」','動物實驗室','再與同位置','(25,24)','(20,8)','真紅的手鐲','阿爾卡迪亞古錢 5 枚'])assert(guide.includes(text),text);
 assert(!/本機|我們|MapTool|CgStairFinder|藍國/.test(guide));
});

test('每場血量放在對應步驟，分開單人房間與合戰，註明追加殭屍',()=>{
 const sections={azuki:'## 3.',sakura:'## 4.',ume:'## 4.',yamabuki:'## 4.',trio:'### 第一戰',chimera:'### 第二戰'};
 for(const battle of config.battles){
  const section=guide.split(sections[battle.key])[1].split(/\n#{2,3} /)[0];
  for(const u of battle.enemies)assert(section.includes(`${format(u.hpMin)}～${format(u.hpMax)}`),`${battle.key}: ${u.name}`);
 }
 const chimera=config.battles.find(b=>b.key==='chimera');
 assert.deepEqual(chimera.enemies.map(u=>u.level),[75,50]);
 assert.equal(chimera.enemies[1].openingCount,4);
 assert.equal(chimera.enemies[1].observedConcurrentCount,5);
 assert(guide.includes('曾同時出現 5 隻，開場 4 隻不是上限'));
 assert(!guide.split('## 6.')[1].includes('12,053'));
});

test('十三張配圖有正確預覽尺寸與原圖連結，連續地圖以戰勝傳送銜接',async()=>{
 const images=[...guide.matchAll(/<a href="([^"]+)"><img src="([^"]+)"[^>]*width="(\d+)" height="(\d+)"[^>]*>/g)];
 assert.equal(images.length,13);
 for(const [,href,src,w,h] of images){
  assert(src.includes('/preview/'));assert.equal(href,src.replace('/preview/','/'));assert(fs.existsSync('public'+href));
  const m=await sharp('public'+src).metadata();assert.deepEqual([m.width,m.height],[+w,+h]);assert(+w<=1000);
 }
 const flow=JSON.parse(fs.readFileSync('content/data/quest-maps/medal6-assassins-links.json','utf8'));
 assert.deepEqual(flow.stages.map(s=>s.mapId),[35004,35005,35006]);
 for(const stage of flow.stages){assert(stage.transition.includes('戰勝'));assert(config.maps.find(m=>m.id===stage.mapId).routes[stage.routeIndex]);}
 assert(config.maps.every(m=>m.id<40000),'不將隨機迷宮樓梯固化成路線');
});
