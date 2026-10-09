import bindings from '../../content/data/道具採集關聯.json';
import { loadDataset, type Dataset } from './datasets';

interface Source {
  dataset: string;
  href: string;
  nameColumn: string;
  fields: string[];
}
interface Binding {
  sources: string[];
  supplement: string;
}
export interface ItemGathering {
  supplement: string;
  groups: { skill: string; href: string; fields: string[]; rows: Record<string, string>[] }[];
}

/**
 * 關聯契約由道具採集關聯.json 明確定義，地點只讀原採集 CSV。
 * 不解析道具庫舊散文、不合併同名列、不去重座標，也不以子分類猜採集技能。
 * 同名多技能／多等級的資料保留各自的列，CSV 增加地點後兩種頁面一起更新。
 * 缺表、改欄名或失去對應列時直接報错，避免悄悄退回舊地點。
 */
export function getItemGathering(
  itemName: string,
  readDataset: (name: string) => Dataset | null = loadDataset,
): ItemGathering | null {
  const binding = (bindings.items as Record<string, Binding>)[itemName];
  if (!binding) return null;
  const sources = bindings.sources as Record<string, Source>;
  return {
    supplement: binding.supplement,
    groups: binding.sources.map((skill) => {
      const source = sources[skill];
      if (!source) throw new Error(`道具採集關聯：${itemName} 的來源 ${skill} 未定義`);
      const table = readDataset(source.dataset);
      if (!table) throw new Error(`道具採集關聯：找不到 ${source.dataset}.csv`);
      for (const column of [source.nameColumn, '等級', '分類', ...source.fields]) {
        if (!table.columns.includes(column)) {
          throw new Error(`道具採集關聯：${source.dataset}.csv 缺少欄位 ${column}`);
        }
      }
      const rows = table.rows.filter((row) => row[source.nameColumn] === itemName);
      if (!rows.length) throw new Error(`道具採集關聯：${source.dataset}.csv 找不到 ${itemName}`);
      return { skill, href: source.href, fields: source.fields, rows };
    }),
  };
}
