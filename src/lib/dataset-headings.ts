/**
 * 原 Google Sites 嵌入表格的區塊標題。
 *
 * CSV 檔名是搬遷時用頁名流水編號產生的，不一定等於原站顯示名稱；例如
 * `S階武器-2.csv` 的標題其實是「Ｓ階鑄標」。這裡只補展示層標題，絕不拿
 * 原站資料重建或覆寫 CSV。
 */
const SPECIAL_HEADINGS: Record<string, readonly string[]> = {
  生產製造: [
    'Ｓ階鑄弓',
    'Ｓ階鑄標',
    'Ｓ階鑄小刀',
    'Ｓ階鑄杖',
    'Ｓ階鑄劍',
    'Ｓ階鑄斧',
    'Ｓ階鑄槍',
    '太刀製作',
  ],
  S階武器: [
    'Ｓ階鑄弓',
    'Ｓ階鑄標',
    'Ｓ階鑄小刀',
    'Ｓ階鑄杖',
    'Ｓ階鑄劍',
    'Ｓ階鑄斧',
    'Ｓ階鑄槍',
    '太刀製作',
  ],
  S階防具: [
    'Ｓ階製帽',
    'Ｓ階製衣',
    'Ｓ階製鞋',
    'Ｓ階製袍',
    'Ｓ階製盔',
    'Ｓ階製鎧',
    'Ｓ階製靴',
    'Ｓ階製盾',
  ],
  S階生產採集: ['Ｓ階料理', 'Ｓ階製藥', 'Ｓ階伐木', 'Ｓ階挖掘', 'Ｓ階狩獵'],
  神器寵物裝備屬性: [
    '九級神器(武)',
    '九級神器(防)',
    '十級神器(武)',
    '十級神器(防)',
    '寵裝屬性',
    '泰坦寵裝',
  ],
  傳奇套裝: [
    '星辰防具配方',
    '幻影星辰武器',
    '蒼穹星辰武器',
    '幻影星辰套效果',
    '蒼穹星辰套效',
    '月之防具配方',
    '月之武器配方',
    '月之祝福套效',
    '歎息防具配方',
    '歎息武器配方',
    '歎息之海套效',
    '守望者防具',
    '守望者武器',
    '守望者套效',
    '聖誕頌歌裝備',
    '聖誕頌歌套效',
    '其他套裝',
    '其他套效',
  ],
  寶石袋: [
    '聖龍寶石袋',
    '星辰寶石袋',
    '魔龍寶石袋',
    '月之寶石袋',
    '女媧寶石袋',
    '海洋寶石袋',
    '玄武寶石袋',
    '青龍寶石袋',
    '朱雀寶石袋',
    '白虎寶石袋',
    '聖誕頌歌寶石袋',
    '仙道寶石袋',
  ],
};

const SPECIAL_TITLE_BY_DATASET = new Map<string, string>();
for (const [base, titles] of Object.entries(SPECIAL_HEADINGS)) {
  titles.forEach((title, index) => {
    const dataset = index === 0 ? base : `${base}-${index + 1}`;
    SPECIAL_TITLE_BY_DATASET.set(dataset, title);
  });
}

/**
 * 只替已確認遺失標題的多表頁回傳標題；其他頁回傳 undefined，避免單表頁
 * 額外長出與頁面 H1 重複的標題。
 */
export function datasetHeading(pageId: string, dataset: string, datasetCount: number) {
  if (dataset === '精神衝擊波等級常數') return '各等級的基礎 G';
  if (datasetCount < 2) return undefined;

  const special = SPECIAL_TITLE_BY_DATASET.get(dataset);
  if (special) return special;

  // 42 個職業頁的原站 category.name 就是 CSV 名稱。尾端流水號只是同名 CSV
  // 防撞（御法劍仙與生產系的「初心技能上限」），不屬於顯示文字。
  if (pageId.startsWith('職業總覽/')) return dataset.replace(/-\d+$/, '');

  return undefined;
}
