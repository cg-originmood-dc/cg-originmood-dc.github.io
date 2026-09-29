// node --experimental-strip-types tests/pet-skill-cost.test.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'csv-parse/sync';
import {blankPetPlan, parsePetSkillPrices, petPlanTotal, restorePetPlans, MAX_PETS, MAX_SKILLS} from '../src/lib/petSkillCost.ts';

const rows=parse(readFileSync('content/data/寵物技能學習費用.csv','utf8'),{columns:true,skip_empty_lines:true});
const prices=parsePetSkillPrices(rows);
assert.equal(prices.length,31);
assert.equal(prices.filter(s=>s.note).length,6);
const byAlias=new Map(prices.map(s=>[s.alias,s]));
const plan=aliases=>({name:'測試寵物',skills:[...aliases.map(a=>byAlias.get(a).id),...Array(MAX_SKILLS-aliases.length).fill('')]});
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
const saved={version:1,pets:cases.map(([aliases])=>plan(aliases))};
assert.deepEqual(restorePetPlans(saved,prices),saved.pets);
assert.throws(()=>restorePetPlans({version:1,pets:[plan(['乾','乾'])]},prices));
assert.throws(()=>restorePetPlans({version:1,pets:[{name:'x',skills:Array(10).fill('unknown')}]},prices));
assert.throws(()=>restorePetPlans({version:1,pets:[{name:'x',skills:[]}]},prices));
for(const value of [null,{},[],{version:2,pets:[blankPetPlan()]},{version:1,pets:[]},{version:1,pets:Array(MAX_PETS+1).fill(blankPetPlan())}]) assert.throws(()=>restorePetPlans(value,prices));
for(const value of ['', '-1','NaN','1.5','Infinity'])assert.throws(()=>parsePetSkillPrices([{...rows[0],費用:value}]));
assert.throws(()=>parsePetSkillPrices([rows[0],rows[0]]));
assert.throws(()=>parsePetSkillPrices([]));
assert.throws(()=>petPlanTotal({name:'',skills:['unknown']},prices));
console.log('PASS: 31 prices; source examples total 1,122,600 G; duplicates, invalid prices and saved plans checked.');
