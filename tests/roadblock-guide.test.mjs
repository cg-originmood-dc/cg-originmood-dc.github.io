import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
const guide=fs.readFileSync('content/pages/任務攻略/魔力任務/路霸阿德基姆.md','utf8');

test('路霸區分過橋兩連戰與結晶後續三連戰，勳章連回本站',()=>{
 for(const text of ['(228,199)','(13,10)','(14,7)','(309,349)','(317,345)','(12,11)','兩場連續戰鬥','三場連續戰鬥','大地的結晶'])assert(guide.includes(text),text);
 assert(!/MapTool|CgStairFinder|本機|我們/.test(guide));
 for(const name of ['八等勳章','一等勳章']){
  const page=fs.readFileSync(`content/pages/任務攻略/魔力任務/${name}.md`,'utf8');
  assert(page.includes('](/任務攻略/魔力任務/路霸阿德基姆)'));
 }
 assert(JSON.parse(fs.readFileSync('content/nav-order.json','utf8')).includes('路霸阿德基姆'));
});

test('路霸六張路線圖預覽尺寸正確，皆可放大',async()=>{
 const images=[...guide.matchAll(/<a href="([^"]+)"><img src="([^"]+)"[^>]*width="(\d+)" height="(\d+)"[^>]*>/g)];
 assert.equal(images.length,6);
 for(const [,href,src,width,height] of images){
  assert.equal(href,src.replace('/preview/','/'));
  assert(fs.existsSync('public'+href));
  const meta=await sharp('public'+src).metadata();
  assert.deepEqual([meta.width,meta.height],[+width,+height]);
 }
});
