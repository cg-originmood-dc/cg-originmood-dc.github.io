// node --experimental-strip-types --test tests/item-catalog.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'csv-parse/sync';
import sharp from 'sharp';
import {filterCatalog,catalogPage} from '../src/lib/itemCatalog.ts';

const csv=fs.readFileSync('content/data/道具庫.csv','utf8');
const items=parse(csv,{columns:true,bom:true,skip_empty_lines:true});
const options={query:'',category:'',source:'',numericOnly:false,sort:'new'};

test('道具名稱唯一，新增道具有描述或明確待核對註記',()=>{
  assert(items.length>=1281);
  assert.equal(new Set(items.map(i=>i.名稱)).size,items.length);
  const fresh=items.filter(i=>i.收錄來源==='遊戲觀察新增');
  assert(fresh.length>=459);
  for(const i of fresh){
    assert(i.名稱&&i.分類);
    assert(i.收錄日期);
    assert(!i.說明.includes('銧帚犖'));
  }
  const candy=items.find(i=>i.名稱==='萬聖節糖果');
  assert.match(candy.說明,/恢復50法力值/);
  const bad=items.find(i=>i.名稱==='老婆婆的黑輪');
  assert.equal(bad.實測案例,'');
  assert.equal(bad.實測說明,'');
  assert.match(bad.觀察註記,/待核對/);
  assert(!/TonyQ|CharacterName|Account|AppData|ViewIcon|IconNumber/.test(csv));
});

test('參考能力與單件案例分開，多組實測不合併成上下限',()=>{
  const staff=items.find(i=>i.名稱==='元素之杖');
  assert(staff.能力參考&&staff.能力來源);
  assert.match(staff.實測案例,/精神\+25/);
  assert.match(staff.實測案例,/精神\+30/);
  assert.match(staff.實測案例,/耐久（觀察時）/);
  assert(!staff.實測案例.includes('25~30'));
  const accessory=items.find(i=>i.名稱==='二週年新手勇者頭飾');
  assert.match(accessory.實測案例,/攻擊\+15/);
  assert.match(accessory.實測案例,/生命\+250/);
  for(const i of items)if(i.能力參考)assert(i.能力來源);
});

test('來源、分類、關鍵字與數值篩選可組合且不改寫原資料',()=>{
  const original=items.map(i=>i.名稱);
  const fresh=filterCatalog(items,{...options,source:'new'});
  assert(fresh.every(i=>i.收錄來源==='遊戲觀察新增'));
  const observed=filterCatalog(items,{...options,source:'observed'});
  assert(observed.length>=576);
  assert(observed.length>fresh.length);
  const results=filterCatalog(items,{...options,category:'飾品',query:'新手 生命+250',numericOnly:true});
  assert(results.some(i=>i.名稱==='二週年新手勇者頭飾'));
  assert(results.every(i=>i.分類==='飾品'));
  assert.equal(filterCatalog(items,{...options,query:'沒有這種道具xyz'}).length,0);
  assert.deepEqual(items.map(i=>i.名稱),original);
});

test('等級按數字排序，分頁限制 50 筆並處理空集合及超出頁碼',()=>{
  const sample=['10','','2','1','1、2'].map((level,i)=>({名稱:`道具${i}`,分類:'',等級:level}));
  assert.deepEqual(filterCatalog(sample,{...options,sort:'level'}).map(i=>i.等級),['1','2','10','','1、2']);
  assert.equal(catalogPage(items,1).rows.length,50);
  assert.equal(catalogPage(items,-3).page,1);
  const last=catalogPage(items,100000);
  assert.equal(last.page,last.pages);
  assert(last.rows.length>0&&last.rows.length<=50);
  assert.deepEqual(catalogPage([],100),{rows:[],page:1,pages:1,total:0});
});

test('補入的道具圖為小型本地靜態 WebP',async()=>{
  const images=[...new Set(items.map(i=>i.image).filter(p=>p.startsWith('/img/items/observed/')))];
  assert(images.length>=419);
  let bytes=0;
  for(const image of images){
    const file='public'+image;
    const meta=await sharp(file).metadata();
    assert.equal(meta.format,'webp');assert.equal(meta.pages??1,1);
    bytes+=fs.statSync(file).size;
  }
  assert(bytes<500_000);
});
