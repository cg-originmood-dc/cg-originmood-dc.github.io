/**
 * 成本計算的配方組裝，成本計算頁與材料價格頁共用。
 *
 * 配方不另外抄一份：直接吃本站武器／防具／料理／藥水各 CSV 的材料欄，
 * 那邊修資料這裡自動跟著變。材料市價隨伺服器行情浮動、沒有「正確值」
 * 可以放資料層，一律由使用者輸入、記在 localStorage
 * （鍵 `craftcost:price:<材料名>`，兩頁同鍵共用）。
 */
import { loadDataset } from './datasets';
import { hasItem } from './items';

/** 下拉的類別分組。名稱同 content/data 檔名與生產頁面，新增一份 CSV 時在這裡掛上即可。 */
export const GROUPS: { label: string; sets: string[] }[] = [
  { label: '武器', sets: ['劍', '斧', '槍', '弓', '杖', '投擲武器', '小刀', '太刀'] },
  { label: '防具', sets: ['頭盔', '帽子', '鎧甲', '衣服', '長袍', '盾牌', '靴子', '鞋子'] },
  { label: '料理／藥水', sets: ['料理', '藥水'] },
];

/** 材料欄的單項格式「名稱(數量)」。名稱本身可含括號（生命力回復藥(100)），靠結尾錨定拆數量。 */
const MAT = /^(.+?)\((\d+)\)$/;

/** [名稱, 數量, 是否在道具庫（1 可連到道具頁）] */
export type Mat = [string, number, 0 | 1];
export type Product = { c: string; l: string; v: number; n: string; s: string; m: Mat[] };

export function loadProducts(): Product[] {
  const products: Product[] = [];
  for (const g of GROUPS) {
    for (const set of g.sets) {
      const ds = loadDataset(set);
      if (!ds) {
        console.warn(`[成本計算] 找不到資料集 ${set}`);
        continue;
      }
      let skipped = 0;
      for (const r of ds.rows) {
        const raw = (r['材料'] ?? '').trim();
        const parts = raw ? raw.split('、') : [];
        const m: Mat[] = [];
        let ok = parts.length > 0;
        for (const part of parts) {
          const hit = MAT.exec(part.trim());
          if (!hit) {
            ok = false;
            break;
          }
          m.push([hit[1], Number(hit[2]), hasItem(hit[1]) ? 1 : 0]);
        }
        // 材料解析不完整就整筆不收：算出少一味材料的成本比沒得算更糟
        if (!ok) {
          skipped++;
          continue;
        }
        products.push({
          c: set,
          l: (r['等級'] ?? '').trim(),
          v: Number.parseInt(r['等級'] ?? '', 10) || 0,
          n: (r['名稱'] ?? '').trim(),
          s: (r['販店價'] ?? '').trim(),
          m,
        });
      }
      if (skipped) {
        console.warn(`[成本計算] ${set}：${skipped} 列材料欄空白或格式非「名稱(數量)」，未列入`);
      }
    }
  }
  return products;
}

/** 所有配方會用到的材料名稱（依配方掃到的順序去重）。材料價格頁循此展開，介面不自寫清單。 */
export function listMaterials(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of loadProducts()) {
    for (const [n] of p.m) {
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}
