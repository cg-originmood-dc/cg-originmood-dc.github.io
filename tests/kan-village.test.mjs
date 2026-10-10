import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';

const route='/地圖/米內葛爾島/坎那貝拉村';
const guide=fs.readFileSync(`content/pages${route}.md`,'utf8');

test('坎村前往說明從七勳連入，區分首次步行與記點傳送',()=>{
 const medal=fs.readFileSync('content/pages/任務攻略/魔力任務/七等勳章.md','utf8');
 assert(medal.includes(`](${route})`));
 for(const text of ['已記點：','第一次前往：','黃月木 200','銀礦 200','原礦，不是銀條','(168,107)','(20,27)','(441,302)','(627,305)'])assert(guide.includes(text),text);
 assert(!/MapTool|CgStairFinder|本機|我們/.test(guide));
 const config=JSON.parse(fs.readFileSync('content/data/quest-maps/kan-village.json','utf8'));
 const flow=JSON.parse(fs.readFileSync('content/data/quest-maps/kan-village-links.json','utf8'));
 assert.deepEqual(flow.stages.map(s=>s.mapId),[34013,34014,34015]);
 for(const s of flow.stages)assert(config.maps.find(m=>m.id===s.mapId).routes[s.routeIndex]);
});

test('坎村八張配圖使用尺寸正確的壓縮預覽，保留完整圖連結',async()=>{
 const images=[...guide.matchAll(/<a href="([^"]+)"><img src="([^"]+)"[^>]*width="(\d+)" height="(\d+)"[^>]*>/g)];
 assert.equal(images.length,8);
 for(const [,href,src,w,h] of images){
  assert(src.includes('/preview/'));assert.equal(href,src.replace('/preview/','/'));assert(fs.existsSync('public'+href));
  const metadata=await sharp('public'+src).metadata();assert.deepEqual([metadata.width,metadata.height],[+w,+h]);assert(+w<=1000);
 }
});
