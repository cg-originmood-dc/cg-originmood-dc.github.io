import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';

const guide=fs.readFileSync('content/pages/任務攻略/魔力任務/八等勳章.md','utf8');
const config=JSON.parse(fs.readFileSync('content/data/quest-maps/medal8.json','utf8'));

test('八等勳章列在系列起點，攻略說明海洞前頭目與兩國收尾',()=>{
 const series=fs.readFileSync('content/pages/任務攻略/魔力任務/蘭國及艾爾巴勳章系列.md','utf8');
 const index=fs.readFileSync('content/pages/任務攻略.md','utf8');
 const nav=JSON.parse(fs.readFileSync('content/nav-order.json','utf8'));
 assert(series.includes('八等 → 七等'));
 assert(series.includes('/任務攻略/魔力任務/八等勳章'));
 assert(index.includes('/任務攻略/魔力任務/八等勳章'));
 assert(nav.indexOf('八等勳章－商隊襲擊')<nav.indexOf('七等勳章－人魚之淚'));
 for(const text of ['頭目戰在過海洞之前','(402,242)','(441,302)','蘭國第八等勳章','艾爾巴第八等勳章','森之月石','6,649～7,021','6,695～7,148'])assert(guide.includes(text),text);
 assert.equal([...guide.matchAll(/^## /gm)].length,3,'主流程只有三步');
 assert.equal([...guide.matchAll(/<details>/g)].length,3,'南恰拉山路線直接顯示，其餘地圖收合');
 assert(!/MapTool|CgStairFinder|本機|我們|藍國/.test(guide));
 const island=config.maps.find(m=>m.assetName==='island');
 assert(guide.includes('打贏兩場連續戰鬥後過橋'));
 assert(island.points.some(p=>p[0]===309&&p[1]===349&&p[2].includes('連戰兩場後過橋')));
 assert(island.points.some(p=>p[0]===441&&p[1]===302));
 assert(island.routes.every(r=>r.every(p=>p[0]!==441||p[1]!==302)),'海洞不在步行路線終點');
});

test('十一張地圖皆有壓縮預覽、正確尺寸與可放大原圖',async()=>{
 const images=[...guide.matchAll(/<a href="([^"]+)"><img src="([^"]+)"[^>]*width="(\d+)" height="(\d+)"[^>]*>/g)];
 assert.equal(images.length,11);
 for(const [,href,src,width,height] of images){
  assert(src.includes('/preview/'));
  assert.equal(href,src.replace('/preview/','/'));
  assert(fs.existsSync('public'+href));
  const info=await sharp('public'+src).metadata();
  assert.deepEqual([info.width,info.height],[+width,+height]);
  assert(+width<=1000);
 }
});

test('山賊段落直接顯示兩村交通總覽，穿洞與步行分開標示',()=>{
 const section=guide.split('### 過橋後打山賊')[1].split('<details>')[0];
 assert(section.includes('island-overview.webp'));
 for(const text of ['阿凱魯法村出發','坎那貝拉村出發','反向走','虛線','不是銀條'])assert(section.includes(text));
 const overview=JSON.parse(fs.readFileSync('content/data/quest-maps/medal8-overview.json','utf8')).maps[0];
 assert.equal(overview.routes.length,6);
 assert.equal(overview.routeColors.length,overview.routes.length);
 assert(overview.transitions.some(t=>String(t.from)==='472,282'&&String(t.to)==='441,302'));
 for(const transition of overview.transitions)assert(!overview.routes.some(([s,e])=>String(s)===String(transition.from)&&String(e)===String(transition.to)));
});
