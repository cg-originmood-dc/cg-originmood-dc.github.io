import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const guide=fs.readFileSync('content/pages/任務攻略/魔力任務/四等勳章.md','utf8');
const variants=JSON.parse(fs.readFileSync('content/data/quest-maps/medal4.json','utf8')).secretRoomVariants;

test('四勳區分兩國正確配置、艾爾巴誤入蘭國結果與假房間，保留觀察血量',()=>{
 for(const country of ['艾爾巴','蘭國']){
  const route=guide.split(`## ${country}路線`)[1].split('\n## ')[0];
  const step=route.split('### 5. 取得魔導研究塔鑰匙')[1].split('### 6.')[0];
  assert(step.includes('「???」'));assert(step.includes('不只一種配置，也有假房間'));
  assert(step.includes('蜜迪雅（密迪亞）、安蒂、可可、瑪格諾亞都是假房間'));
  assert(step.includes('傳回廊下，不給鑰匙'));
  for(const room of variants.filter(v=>v.fakeRoom))assert(step.includes(room.npc));
  assert(step.includes('雅可布＋梅利艾拉（艾爾巴）'));
  assert(step.includes('瓦吉＋雅可布（蘭國）'));
  assert(step.includes('艾爾巴打完仍會被傳出，不給鑰匙'));
  assert(step.includes('蘭國戰後找雅可布領鑰匙'));
  for(const {boss} of variants.filter(v=>v.boss)){
   assert(step.includes(`${boss.hpMin.toLocaleString('en-US')}～${boss.hpMax.toLocaleString('en-US')}`));
   assert(step.includes(`Lv${boss.level} ×${boss.count}`));
  }
 }
 const lan=guide.split('## 蘭國路線')[1];
 assert(!lan.includes('領鑰匙條件仍待確認'));
 assert(lan.includes('這是蘭國的正確配置，不是假房間'));
 assert.equal(variants.find(v=>v.key==='waji').country,'蘭國');
 assert.equal(variants.find(v=>v.key==='waji').wrongRouteResult.country,'艾爾巴');
 assert.equal(variants.find(v=>v.key==='jacob').country,'艾爾巴');
 assert.equal(variants.find(v=>v.key==='waji').beforeMapId,46032);
 assert.equal(variants.find(v=>v.key==='jacob').beforeMapId,46031);
 assert.equal(variants.find(v=>v.key==='midiya').afterMapId,46030);
 assert.equal(variants.find(v=>v.key==='midiya').boss,null);
 assert.deepEqual(variants.filter(v=>v.fakeRoom).map(v=>v.npc),['蜜迪雅','安蒂','可可','瑪格諾亞']);
});
