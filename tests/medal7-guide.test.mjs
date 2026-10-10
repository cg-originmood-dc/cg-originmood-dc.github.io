import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
const guide=fs.readFileSync('content/pages/任務攻略/魔力任務/七等勳章.md','utf8');
const config=JSON.parse(fs.readFileSync('content/data/quest-maps/medal7.json','utf8'));

test('七勳兩國各自有完整流程，頭目採觀察血量，最後領錢袋',()=>{
 for(const name of ['艾爾巴','蘭國']){
  const section=guide.split(`## ${name}路線`)[1].split('\n## ')[0];
  for(const text of ['人魚之淚','仲時的琵琶','月之水滴','錢袋',`${name}第七等勳章`,'8,983～9,118','1,004～1,267','地下水脈隨機迷宮'])assert(section.includes(text),name+text);
 }
 assert(!/MapTool|CgStairFinder|本機|我們|藍國|6,500～7,000|10,000/.test(guide));
 const series=fs.readFileSync('content/pages/任務攻略/魔力任務/蘭國及艾爾巴勳章系列.md','utf8');
 const previous=fs.readFileSync('content/pages/任務攻略/魔力任務/八等勳章.md','utf8');
 for(const text of [series,previous])assert(text.includes('](/任務攻略/魔力任務/七等勳章)'));
 const boss=config.maps.find(m=>m.assetName==='boss');
 assert.deepEqual(boss.routes[0][1],[2,2],'財寶必須經左上隱藏通道');
});

test('十四張配圖均為壓縮預覽並可開原圖，樓梯流程引用正確路段',async()=>{
 const images=[...guide.matchAll(/<a href="([^"]+)"><img src="([^"]+)"[^>]*width="(\d+)" height="(\d+)"[^>]*>/g)];
 assert.equal(images.length,14);
 for(const [,href,src,w,h] of images){
  assert(src.includes('/preview/'));assert.equal(href,src.replace('/preview/','/'));assert(fs.existsSync('public'+href));
  const m=await sharp('public'+src).metadata();assert.deepEqual([m.width,m.height],[+w,+h]);assert(+w<=1000);
 }
 const flow=JSON.parse(fs.readFileSync('content/data/quest-maps/medal7-waterway-links.json','utf8'));
 assert.equal(flow.stages.length,3);
 for(const s of flow.stages)assert(config.maps.find(m=>s.assetName?m.assetName===s.assetName:m.id===s.mapId).routes[s.routeIndex]);
});
