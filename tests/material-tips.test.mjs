import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tips=JSON.parse(fs.readFileSync('content/data/道具提示.json','utf8'));
test('布料購買提示包含商店與 NPC 座標，保留小麥粉兌換連結',()=>{
 for(const name of ['麻布','木棉布','毛氈','棉','細線','絹布','莎蓮娜線','傑諾瓦線','細麻布','開米士毛線','阿巴尼斯製的線','阿巴尼斯製的布']){
  assert(tips[name].text.startsWith('購買地點：\n'));
  assert.match(tips[name].text,/\(\d+,\d+\)/);
 }
 for(const name of ['棉','細線']){
  assert(tips[name].text.includes('法蘭城 流行商店(117,112) 布商克蘿姆(8,5)'));
  assert(tips[name].text.includes('亞諾曼城 勝興布莊(129,148) 布商畢勝(12,12)'));
 }
 assert.equal(tips['小麥粉'].href,'/道具總覽/小麥粉/#acquisition');
 assert(tips['小麥粉'].text.includes('蕃茄醬'));
});
