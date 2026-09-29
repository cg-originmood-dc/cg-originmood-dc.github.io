// node --experimental-strip-types tests/pet-skill-cost.test.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'csv-parse/sync';
import {blankPetPlan, parsePetSkillPrices, petPlanTotal, restorePetPlans, planFromPreset, templeSkillPrices, MAX_PETS, MAX_SKILLS} from '../src/lib/petSkillCost.ts';

const rows=parse(readFileSync('content/data/寵物技能學習費用.csv','utf8'),{columns:true,skip_empty_lines:true});
const prices=parsePetSkillPrices(rows);
assert.equal(prices.length,31);
assert.equal(prices.filter(s=>s.note).length,6);
const byAlias=new Map(prices.map(s=>[s.alias,s]));
const plan=aliases=>({...blankPetPlan(),name:'測試寵物',skills:[...aliases.map(a=>byAlias.get(a).id),...Array(MAX_SKILLS-aliases.length).fill('')]});
const cases=[
  [['乾','戰','明','崩','護','抗混'],110100],
  [['單火','單石','T火','T石','明','抗混'],335100],
  [['戰','崩','明','抗混'],67100],
  [['戰','崩','明','抗混'],67100],
  [['T石','單石','明','抗混','T風','單風'],335100],
  [['T冰','單冰','單風','抗混'],208100],
];
for(const [aliases,expected] of cases) assert.equal(petPlanTotal(plan(aliases),prices),expected);
assert.equal(cases.reduce((sum,[aliases])=>sum+petPlanTotal(plan(aliases),prices),0),1122600);
assert.equal(petPlanTotal(blankPetPlan(),prices),0);
assert.equal(petPlanTotal(plan(['乾','乾']),prices),16000);
assert.equal(petPlanTotal(plan(['混攻','毒攻','石攻','酒攻','遺忘攻','睡攻']),prices),73500);
const saved={version:2,pets:cases.map(([aliases])=>plan(aliases))};
assert.deepEqual(restorePetPlans(saved,prices),saved.pets);
assert.throws(()=>restorePetPlans({version:1,pets:[plan(['乾','乾'])]},prices));
assert.throws(()=>restorePetPlans({version:1,pets:[{name:'x',skills:Array(10).fill('unknown')}]},prices));
assert.throws(()=>restorePetPlans({version:1,pets:[{name:'x',skills:[]}]},prices));
for(const value of [null,{},[],{version:3,pets:[blankPetPlan()]},{version:1,pets:[]},{version:1,pets:Array(MAX_PETS+1).fill(blankPetPlan())}]) assert.throws(()=>restorePetPlans(value,prices));
for(const value of ['', '-1','NaN','1.5','Infinity'])assert.throws(()=>parsePetSkillPrices([{...rows[0],費用:value}]));
assert.throws(()=>parsePetSkillPrices([rows[0],rows[0]]));
assert.throws(()=>parsePetSkillPrices([]));
assert.throws(()=>petPlanTotal({name:'',skills:['unknown']},prices));
assert.equal(MAX_SKILLS,13);
const old={version:1,pets:[{name:'舊版',skills:['power',...Array(9).fill('')]}]};
const migrated=restorePetPlans(old,prices)[0];
assert.equal(migrated.skills.length,13);assert.equal(migrated.known.length,13);
assert.equal(petPlanTotal(migrated,prices),16000);
const presets=JSON.parse(readFileSync('content/data/寵物技能試算預設.json','utf8')).pets;
assert.equal(new Set(presets.map(p=>p.name)).size,presets.length);
for(const p of presets){assert(p.skills.length<=13);assert(p.skills.every(s=>typeof s==='string'&&s.length<=120));}
const hanzo=planFromPreset(presets.find(p=>p.name==='半藏'));
assert.equal(hanzo.known.filter(Boolean).length,4);assert.equal(petPlanTotal(hanzo,prices),0);
assert.deepEqual(restorePetPlans({version:2,pets:[hanzo]},prices),[hanzo]);
hanzo.skills[4]='power';assert.equal(petPlanTotal(hanzo,prices),16000);
hanzo.skills[0]='power';assert.throws(()=>restorePetPlans({version:2,pets:[hanzo]},prices));
assert.equal(planFromPreset(presets.find(p=>p.name==='虎人')).known.filter(Boolean).length,0);
const temple=templeSkillPrices(parse(readFileSync('content/data/寵物物理學習聖殿卷費用.csv','utf8'),{columns:true}));
assert.equal(temple.length,48);
const q4=temple.find(s=>s.name==='氣功彈'&&s.level===4);assert.equal(q4.fee,400000);assert.equal(q4.cumulative,1000000);assert.equal(q4.fromLevel,1);
const c13=temple.find(s=>s.name==='連擊'&&s.level===13);assert.equal(c13.cumulative,1068000);assert.equal(c13.fromLevel,10);
assert.throws(()=>templeSkillPrices([{技能:'測試',等級:'1',費用:'100'},{技能:'測試',等級:'3',費用:'300'}]));
assert.throws(()=>templeSkillPrices([{技能:'測試',等級:'1',費用:'-1'}]));
console.log('PASS: tree totals unchanged; 13 slots; v1 migration; pet presets/free known skills; 48 separate temple prices and cumulative ranges.');
