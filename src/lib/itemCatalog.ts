import type {ItemRecord} from './items';

export type CatalogOptions = {query:string; category:string; source:string; numericOnly:boolean; sort:string};

/** The catalog and detail pages share 道具庫.csv; no external data is merged at runtime. */
export function filterCatalog(items: ItemRecord[], options: CatalogOptions): ItemRecord[] {
  const words = options.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = items.filter(item => {
    if (options.category && item.分類 !== options.category) return false;
    if (options.source === 'new' && item.收錄來源 !== '遊戲觀察新增') return false;
    if (options.source === 'observed' && !item.收錄來源?.includes('遊戲觀察')) return false;
    if (options.numericOnly && !(item.能力參考 || item.實測案例)) return false;
    const text = [item.名稱,item.分類,item.子分類,item.說明,item.實測說明,item.能力參考,item.實測案例].join(' ').toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
  const compare = new Intl.Collator('zh-Hant', {numeric:true}).compare;
  return filtered.sort((a,b) => {
    if (options.sort === 'new') {
      const diff = Number(b.收錄來源 === '遊戲觀察新增') - Number(a.收錄來源 === '遊戲觀察新增');
      if (diff) return diff;
    }
    if (options.sort === 'level') {
      const level = (s:string) => /^\d+$/.test(s) ? Number(s) : Infinity;
      const diff = level(a.等級)-level(b.等級);
      if (diff && !Number.isNaN(diff)) return diff;
    }
    return compare(a.名稱,b.名稱);
  });
}

export function catalogPage(items: ItemRecord[], page:number, size=50) {
  const pages = Math.max(1, Math.ceil(items.length/size));
  const current = Math.min(pages, Math.max(1, Math.floor(page)||1));
  return {rows:items.slice((current-1)*size,current*size), page:current, pages, total:items.length};
}
