import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { buildFusionTreeForPet } from './synthesis';
import { itemImagePath } from './items';

export interface PetRecord {
  名稱: string;
  種族: string;
  體力: string;
  力量: string;
  防禦: string;
  速度: string;
  魔法: string;
  技格: string;
  總檔: string;
  屬性: string;
  技能: string;
  image: string;
  任務用途: string;
  /** 入手方式短述（捕捉座標、活動、兌換等；可含 Markdown 連結） */
  入手方法: string;
  /** 入手分類，供列表篩選：捕捉 / 合成 / 任務 / 活動 / 兌換 / 未知 */
  入手類型: string;
  [key: string]: string;
}

/** 合成樹節點（之後可由其他 agent 補資料） */
export interface FusionNode {
  /** pet | item | gold | material */
  type: 'pet' | 'item' | 'gold' | 'material';
  name: string;
  /** 寵物圖或道具圖路徑 */
  image?: string;
  /** 無圖時的文字標籤（分類短名；勿放 emoji） */
  icon?: string;
  /** 數量，如 × 3 */
  qty?: number | string;
  /** 數量旁說明，如「金幣」 */
  countLabel?: string;
  /** NPC / 座標 / 機率 */
  npc?: string;
  /** 是否為樹尖目標 */
  target?: boolean;
  /** 子節點（向下解構） */
  children?: FusionNode[];
}

/** 詳情補充：多筆／結構化入手（CSV「入手方法」放一句話；這裡放細項） */
export interface ObtainMethod {
  /** capture | fusion | quest | event | exchange | other */
  type?: string;
  /** 地圖、活動名、NPC 等標題 */
  map?: string;
  /** 座標，如 650.426 */
  coords?: string;
  /** 補充說明或長文 */
  note?: string;
  /** 站內路徑或外部 URL */
  link?: string;
}

export interface PetDetailExtra {
  /** 可否封印 */
  sealable?: boolean | null;
  /** 卡片等級文字，如「金卡 5 級」 */
  cardLevel?: string;
  /** 各階段素質：1 / 100 / 140 */
  growth?: Array<{
    level: string;
    hp: string;
    mp: string;
    atk: string;
    def: string;
    agi: string;
    spi: string;
    rec: string;
  }>;
  /** 技能說明（技能全名 → 簡述） */
  skillNotes?: Record<string, string>;
  /** 相關任務補充說明 */
  questNote?: string;
  /** 結構化入手細項（可多筆） */
  obtainMethods?: ObtainMethod[];
  /** 合成樹 */
  fusionTree?: FusionNode;
}

/** 入手類型顯示用中文 */
export function obtainTypeLabel(type?: string): string {
  if (!type?.trim()) return '';
  const map: Record<string, string> = {
    capture: '捕捉',
    fusion: '合成',
    quest: '任務',
    event: '活動',
    exchange: '兌換',
    other: '其他',
    捕捉: '捕捉',
    合成: '合成',
    任務: '任務',
    活動: '活動',
    兌換: '兌換',
    未知: '未知',
    其他: '其他',
  };
  return map[type.trim()] ?? type.trim();
}

const STAT_KEYS = ['體力', '力量', '防禦', '速度', '魔法', '技格', '總檔'] as const;

let cache: PetRecord[] | null = null;
let byName: Map<string, PetRecord> | null = null;
/** CSV 修改時間；dev 改表後會自動重讀，避免入手方法等欄位一直空白 */
let cacheMtimeMs = 0;
let extrasCache: Map<string, PetDetailExtra> | null = null;
let extrasMtimeMs = 0;

function loadAll(): PetRecord[] {
  const file = join(process.cwd(), 'content', 'data', '專屬寵物.csv');
  if (!existsSync(file)) {
    cache = [];
    byName = new Map();
    cacheMtimeMs = 0;
    return cache;
  }
  const mtime = statSync(file).mtimeMs;
  if (cache && mtime === cacheMtimeMs) return cache;

  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as PetRecord[];
  cache = records.filter((r) => (r.名稱 ?? '').trim());
  byName = new Map(cache.map((r) => [r.名稱.trim(), r]));
  cacheMtimeMs = mtime;
  return cache;
}

export function listPets(): PetRecord[] {
  return loadAll();
}

export function getPet(name: string): PetRecord | null {
  loadAll();
  return byName?.get(name) ?? null;
}

export function petStatKeys(): readonly string[] {
  return STAT_KEYS;
}

/** 將技能字串拆成個別技能（用頓號／逗號分隔） */
export function splitSkills(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[、,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\s+.*$/, ''))
    // 過濾明顯非技能的註解碎片
    .filter((s) => !/^(並|傷害|最大|沒有|第三|轉換|隨機|捕捉|Lv1點)/.test(s));
}

/** 從「連擊LV11」取出技能名「連擊」供連結 */
export function skillBaseName(skill: string): string {
  return (
    skill
      .replace(/[（(][^）)]*[）)]/g, '') // 去掉括註
      .replace(/LV\s*\d+.*$/i, '')
      .replace(/Lv\s*\d+.*$/i, '')
      .replace(/；.*$/, '') // 複合技能取前半
      .trim() || skill
  );
}

/** 去掉尾端羅馬數字／純數字後綴（氣功彈I → 氣功彈） */
function stripSkillSuffix(name: string): string {
  return name.replace(/[IVX]+$/i, '').replace(/\d+$/, '').trim() || name;
}

/**
 * 判斷寵物技能字串是否對應某個技能頁名稱
 * 例：頁「諸刃」↔「諸刃LV13」；頁「氣功彈」↔「氣功彈I」「氣功彈LV4」
 */
export function skillMatchesPage(skillToken: string, pageName: string): boolean {
  const token = skillToken.trim();
  const page = pageName.trim();
  if (!token || !page) return false;
  if (token === page) return true;

  const base = skillBaseName(token);
  if (base === page) return true;

  const pageBase = skillBaseName(page);
  if (base === pageBase) return true;

  const core = stripSkillSuffix(base);
  const pageCore = stripSkillSuffix(pageBase);
  if (core.length >= 2 && core === pageCore) return true;

  return false;
}

export interface PetSkillHolder {
  name: string;
  image: string;
  /** 該寵身上的技能原文，如 諸刃LV13 */
  skillLabel: string;
  /** 從技能字串解析的等級；無法解析則為 null */
  level: number | null;
}

/** 從「連擊LV11」「昏睡攻擊Lv12」取出等級數字 */
export function parseSkillLevel(skillLabel: string): number | null {
  const m = skillLabel.match(/(?:LV|Lv)\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 從專屬寵物 CSV 反查持有某技能的寵物（供技能詳情頁） */
export function listPetsWithSkill(skillPageName: string): PetSkillHolder[] {
  /** 同一寵物若寫了多個等級（連擊LV11、連擊LV12），取最高等 */
  const best = new Map<string, PetSkillHolder>();
  for (const pet of listPets()) {
    const name = (pet.名稱 ?? '').trim();
    if (!name) continue;
    for (const sk of splitSkills(pet.技能)) {
      if (!skillMatchesPage(sk, skillPageName)) continue;
      const level = parseSkillLevel(sk);
      const prev = best.get(name);
      if (!prev || (level ?? -1) > (prev.level ?? -1)) {
        best.set(name, {
          name,
          image: petImagePath(name, pet.image),
          skillLabel: sk,
          level,
        });
      }
    }
  }
  const out = [...best.values()];
  // 先按等級、再按名稱
  out.sort((a, b) => {
    const la = a.level ?? 999;
    const lb = b.level ?? 999;
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });
  return out;
}

/** 檔次進度條寬度（單項上限約 50，總檔約 125） */
export function gradePct(value: string, isTotal = false): number {
  const n = Number(String(value).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const max = isTotal ? 140 : 50;
  return Math.min(100, Math.round((n / max) * 100));
}

function loadExtras(): Map<string, PetDetailExtra> {
  const file = join(process.cwd(), 'content', 'data', '寵物詳情補充.json');
  const mtime = existsSync(file) ? statSync(file).mtimeMs : 0;
  if (extrasCache && mtime === extrasMtimeMs) return extrasCache;

  extrasCache = new Map();
  extrasMtimeMs = mtime;

  // 內建：風之使徒（使用者確認正確，對齊 pet_page_template.html）
  extrasCache.set('風之使徒', WIND_APOSTLE_EXTRA);

  // 可選：content/data/寵物詳情補充.json 供之後 agent 擴充
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, PetDetailExtra>;
      for (const [name, extra] of Object.entries(raw)) {
        if (name === '風之使徒') continue; // 模板版優先
        extrasCache.set(name, extra);
      }
    } catch {
      /* ignore bad json */
    }
  }
  return extrasCache;
}

export function getPetExtra(name: string): PetDetailExtra {
  return loadExtras().get(name) ?? {};
}

/**
 * 寵物圖 SSOT：只認「專屬寵物」CSV 該寵列的 image。
 * - 有 CSV 列且 image 有值 → 用那格（與專屬寵物列表同一來源）
 * - 否則 → `/img/專屬寵物/{名稱}.gif`（不借用其他寵、不做模糊 fallback）
 * `fromCsv` 僅在呼叫端已持有同一列時可傳入，避免重複查表；仍以該寵自己的路徑為準。
 */
export function petImagePath(name: string, fromCsv?: string): string {
  const n = (name ?? '').trim();
  if (!n) return '';
  const fromRow = (fromCsv ?? getPet(n)?.image ?? '').trim();
  if (fromRow) return fromRow;
  return `/img/專屬寵物/${n}.gif`;
}

/** 收集樹上所有寵物名稱 */
export function collectPetNamesInTree(node: FusionNode, out = new Set<string>()): Set<string> {
  if (node.type === 'pet' && node.name) out.add(node.name);
  for (const c of node.children ?? []) collectPetNamesInTree(c, out);
  return out;
}

/**
 * 合成樹節點圖檔改寫為 SSOT：
 * - 寵物 → 專屬寵物 CSV / 預設路徑
 * - 道具／材料 → 道具庫 image（有則填）
 * 並去掉 emoji icon，避免 UI 再顯示。
 */
export function applyPetImagesFromSsot(node: FusionNode): FusionNode {
  const children = node.children?.map(applyPetImagesFromSsot);
  const base = children ? { ...node, children } : { ...node };
  // 不再沿用手填 emoji
  if (base.icon) delete base.icon;

  if (base.type === 'pet' && base.name) {
    return { ...base, image: petImagePath(base.name) };
  }
  if ((base.type === 'item' || base.type === 'material') && base.name) {
    const image = itemImagePath(base.name);
    if (image) return { ...base, image };
  }
  return base;
}

/**
 * 取得要顯示的「完整」合成樹。
 * 優先序：
 * 1. 手寫 extras（風之使徒模板、寵物詳情補充.json）
 * 2. 其他 extras 樹中包含本寵的最大樹
 * 3. 寵物合成配方.csv 自動建樹（產物；若僅為材料則掛到可合成的產物樹）
 * 4. 僅樹尖本寵
 * 回傳前會對所有寵物節點套用 petImagePath SSOT。
 */
export function resolveFusionTree(
  petName: string,
  image: string,
): { tree: FusionNode; hasFullData: boolean } {
  const extras = loadExtras();
  const self = extras.get(petName)?.fusionTree;
  if (self?.children?.length) {
    return { tree: applyPetImagesFromSsot(self), hasFullData: true };
  }

  // 在所有已知完整樹中尋找包含本寵的最大樹
  let best: FusionNode | null = null;
  let bestSize = 0;
  for (const extra of extras.values()) {
    const t = extra.fusionTree;
    if (!t?.children?.length) continue;
    const names = collectPetNamesInTree(t);
    if (!names.has(petName)) continue;
    if (names.size > bestSize) {
      best = t;
      bestSize = names.size;
    }
  }
  if (best) return { tree: applyPetImagesFromSsot(best), hasFullData: true };

  // 活動配方自動建樹（寵物合成配方.csv）
  const auto = buildFusionTreeForPet(petName);
  if (auto?.children?.length) {
    return { tree: applyPetImagesFromSsot(auto), hasFullData: true };
  }

  // 無資料：只顯示本寵節點（圖仍走 SSOT）
  return {
    tree: applyPetImagesFromSsot({
      type: 'pet',
      name: petName,
      image,
      target: true,
      children: [],
    }),
    hasFullData: false,
  };
}

// ---------------------------------------------------------------------------
// 風之使徒：合成樹等與 pet_page_template.html 一致（使用者確認正確）
// 卡片等級改為「未知」；素質改由 petStats 公式計算，不寫死
// ---------------------------------------------------------------------------
const WIND_APOSTLE_EXTRA: PetDetailExtra = {
  sealable: false,
  cardLevel: '未知',
  skillNotes: {
    '超強昏睡魔法LV10': '使敵方全體陷入昏睡狀態',
    '潔淨魔法LV3': '解除隊友的異常狀態',
    '超強補血魔法LV7': '為我方全體回復大量生命值',
  },
  questNote: '攜帶風之使徒將在迷宮時空長廊中可獲得任意 NPC 的協助抵達終點。',
  // 寵物節點不寫 image：resolveFusionTree 會用專屬寵物 CSV 的 SSOT 填入
  fusionTree: {
    type: 'pet',
    name: '風之使徒',
    target: true,
    npc: '大法師安蕾雅 @ 艾爾瑪城元素師家 (216.188) (5%)',
    children: [
      {
        type: 'pet',
        name: '天空元素使',
        npc: 'NPC: 愛卡勒恩 @ 寵物研究所 (15，8)',
        children: [
          {
            type: 'pet',
            name: '光精靈',
            children: [
              {
                type: 'pet',
                name: '風精靈',
              },
              {
                type: 'item',
                name: '風精之心',
                qty: 3,
              },
              {
                type: 'item',
                name: '元素石',
                qty: 10,
              },
              {
                type: 'item',
                name: '元素精華',
                qty: 30,
              },
            ],
          },
          {
            type: 'item',
            name: '風元素之卵',
            qty: 3,
          },
          {
            type: 'item',
            name: '閃耀變異之源',
            qty: 10,
          },
          {
            type: 'item',
            name: '精靈王契約',
            qty: 100,
          },
        ],
      },
      {
        type: 'item',
        name: '風元素之卵',
        qty: 1,
      },
      {
        type: 'item',
        name: '閃耀變異之源',
        qty: 10,
      },
      {
        type: 'gold',
        name: '50,000G',
        countLabel: '金幣',
      },
    ],
  },
};
