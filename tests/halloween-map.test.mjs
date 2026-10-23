import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';

const data = JSON.parse(fs.readFileSync('content/data/quest-maps/halloween.json', 'utf8'));

test('換糖清單維持 18 個 NPC、四個頭目，每個標記均有唯一編號', () => {
  assert.equal(data.points.length, 22);
  assert.equal(data.points.filter(p => p.npc).length, 18);
  assert.equal(new Set(data.points.map(p => p.id)).size, 22);
  const groups = new Set(data.groups.map(g => g.name));
  for (const p of data.points) {
    assert(groups.has(p.group));
    assert(Number.isInteger(p.x) && Number.isInteger(p.y));
    const projection = data.projection;
    const x = ((p.x + p.y + 1) * 32 - projection.originX) * projection.scale;
    const y = ((p.y - p.x + projection.gridWidth) * 24 - projection.originY) * projection.scale;
    assert(x >= 0 && x < data.width, p.id);
    assert(y >= 0 && y < data.height, p.id);
  }
  assert.match(data.note, /法蘭城位置示意/);
  assert.match(data.note, /2025/);
});

test('完整底圖與輕量縮圖比例相同，投影與圖片尺寸一致', async () => {
  const full = await sharp('public' + data.image).metadata();
  const small = await sharp('public' + data.overviewImage).metadata();
  assert.equal(full.width, data.width);
  assert.equal(full.height, data.height);
  assert.equal(small.width, 1400);
  assert(Math.abs(full.width / full.height - small.width / small.height) < .002);
  assert(fs.statSync('public' + data.image).size < 1_000_000);
  assert(fs.statSync('public' + data.overviewImage).size < 400_000);
});

test('頁面啟用互動圖，保留舊圖供對照，不再重複維護 NPC 文字清單', () => {
  const page = fs.readFileSync('content/pages/任務攻略/限時活動/萬聖節狂歡.md', 'utf8');
  assert.match(page, /locationMap: "halloween"/);
  assert.match(page, /data-location-map-slot/);
  assert.match(page, /舊版怪物圖（對照用）/);
  assert(!page.includes('貝蒂（231.104）'));
  assert.match(page, /2025 年流程參考/);
});

test('18 種換糖變身各自使用獨立的靜態圖，保留圖片來源', async () => {
  const points = data.points.filter(p => p.npc);
  assert.equal(new Set(points.map(p => p.portrait)).size, 18);
  for (const p of points) {
    assert(p.portrait.endsWith(`/${p.monster}.webp`));
    assert.match(p.portraitSource, /^https:\/\/www\.ibluecg\.com\/pet\/pet1-img\//);
    const image = await sharp('public' + p.portrait).metadata();
    assert.equal(image.pages ?? 1, 1);
    assert(image.width > 0 && image.height > 0);
  }
});
