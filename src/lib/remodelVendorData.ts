/**
 * 初心寵物大改造／改造寵購買 NPC
 * 來源：content/pages/魔力豆知識.md（一次整理寫入，勿 runtime 重讀 MD）
 *
 * 合成規則：
 * - 改造OOO ＝ 原寵 OOO ＋ 改造圖A ＋ 改造圖B ＋ …（依 grades）
 * - grades「ABCDE」＝ 改造圖A～E 各一，不是「改造圖 檔次標籤」
 * - 非「改造」前綴的產物名，底寵見 REMODEL_BASE_PETS
 */

export interface RemodelVendorPet {
  /** 專屬寵物正式名（或經別名對到正式名） */
  name: string;
  /** 可購檔次，如 ABC、ABCDE */
  grades: string;
}

export interface RemodelVendor {
  /** NPC 名稱 */
  npc: string;
  /** 座標／所在（有則寫） */
  location?: string;
  /** 前置任務（有則寫） */
  quest?: string;
  /** 區塊標題（方便對回攻略） */
  section: string;
  pets: RemodelVendorPet[];
}

/** 站內來源頁（BASE_URL 之後） */
export const REMODEL_VENDOR_PAGE = '/魔力豆知識';

/**
 * 攻略異名 → 專屬寵物.csv 正式名（僅產物異名）
 * 注意：不可把底寵「兔耳嚇人箱」對成「改造陰影」（底寵與產物同名衝突）
 */
export const REMODEL_PET_ALIASES: Record<string, string> = {
  '兔耳嚇人箱(改造陰影)': '改造陰影',
};

/**
 * 改造產物 → 底寵原名
 * - 規律「改造OOO」不必寫，由 remodelBasePet 自動剝「改造」
 * - 下列為非規律命名，使用者提供原名後補在這裡
 *
 * 已補：妖花、武裝骷髏、兔耳仙人掌、貓人、惡魔螃蟹、兔耳嚇人箱、幻歌妖
 */
export const REMODEL_BASE_PETS: Record<string, string> = {
  禁地妖花: '妖花',
  深淵武裝骷髏: '武裝骷髏',
  荒漠兔耳仙人掌: '兔耳仙人掌',
  夜行貓人: '貓人',
  墮落惡魔螃蟹: '惡魔螃蟹',
  /** 攻略寫兔耳嚇人箱(改造陰影)；產物正式名改造陰影，底寵兔耳嚇人箱 */
  改造陰影: '兔耳嚇人箱',
  迷幻歌妖: '幻歌妖',
};

/**
 * 合成材料：grades「ABCDE」→「{底寵}設計圖A」…（官方／道具庫用語）
 * 禁止再用裸「改造圖A」（無法對道具庫、也無法區分是哪隻的圖）。
 */
export const REMODEL_BLUEPRINT_KIND = '設計圖';

/** @deprecated 裸前綴已廢止；請用 remodelBlueprintItems(grades, basePet) */
export const REMODEL_BLUEPRINT_PREFIX = '設計圖';

/** @deprecated */
export const REMODEL_BLUEPRINT_ITEM = REMODEL_BLUEPRINT_PREFIX;

/**
 * grades + 底寵名 → ["貓妖設計圖A","貓妖設計圖B",…]
 * basePet 必填；缺底寵時回傳 []（避免再產生無意義的「設計圖A」）。
 */
export function remodelBlueprintItems(grades: string, basePet?: string): string[] {
  const base = (basePet ?? '').trim();
  if (!base) return [];
  const letters = (grades ?? '')
    .toUpperCase()
    .replace(/[^A-E]/g, '')
    .split('');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of letters) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(`${base}${REMODEL_BLUEPRINT_KIND}${ch}`);
  }
  return out;
}

/**
 * 靜態清單（與 魔力豆知識.md 同步；攻略更新時請改此檔）
 */
export const REMODEL_VENDORS: RemodelVendor[] = [
  {
    npc: '寵物改造研究員',
    location: '寵物改造研究所 14.8',
    section: '寵物改造研究員',
    pets: [
      { name: '改造貓妖', grades: 'ABCDE' },
      { name: '改造赤熊', grades: 'ABCDE' },
      { name: '改造地獄骷髏', grades: 'ABCDE' },
      { name: '改造水藍菇', grades: 'ABCDE' },
      { name: '改造迷你石像怪', grades: 'ABCDE' },
    ],
  },
  {
    npc: '雀兒普',
    quest: '殲滅改造殭屍',
    section: '初心寵物大改造購買npc',
    pets: [
      { name: '改造樹精', grades: 'ABC' },
      { name: '改造黃蠍', grades: 'ABC' },
      { name: '改造掃把蝙蝠', grades: 'ABCD' },
      { name: '禁地妖花', grades: 'ABCD' },
      { name: '深淵武裝骷髏', grades: 'ABCDE' },
      { name: '改造烈風哥布林', grades: 'ABCDE' },
      { name: '荒漠兔耳仙人掌', grades: 'ABC' },
    ],
  },
  {
    npc: '香蒂',
    quest: '殲滅改造殭屍',
    section: '初心寵物大改造購買npc',
    pets: [
      { name: '改造殭屍', grades: 'ABC' },
      { name: '夜行貓人', grades: 'ABC' },
      { name: '改造水蜘蛛', grades: 'ABCD' },
      { name: '迷幻歌妖', grades: 'ABCDE' },
      { name: '改造陰影', grades: 'ABCDE' },
      { name: '改造綠色口臭鬼', grades: 'ABCDE' },
      { name: '墮落惡魔螃蟹', grades: 'ABCD' },
    ],
  },
];
