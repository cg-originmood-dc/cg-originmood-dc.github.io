import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import {
  buildFusionTreeFromGraph,
  setHandwrittenFusionTrees,
} from './fusionGraph';
import { itemImagePath } from './items';
import { pickWrapColumns, type Dataset } from './datasets';

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
  /**
   * 這隻是哪一批的：永恆初心專屬 / 一般寵物（魔力原本的野生寵）。
   * 不寫在 CSV 裡——同一份檔案整欄同值等於白佔一欄，
   * 是「哪個檔」決定的事，讀檔時蓋上去就好。見 SOURCES。
   */
  來源: string;
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
  /**
   * 多產物時的「多個頭」（同層並列的產物節點）。
   * 與 children（共用材料）並存：頭在上、材料在下，多拉幾條線即可。
   */
  heads?: FusionNode[];
  /** 子節點（向下解構＝材料） */
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

/**
 * 寵物資料的兩張來源表。
 *
 * 資料檔分兩個而不是併成一張：欄位本來就不同。專屬寵有公告日／公告連結／圖，
 * 魔力原始寵沒有；原始寵有一級捕捉地點，專屬寵多半是合成或活動來的。
 * 清單頁的合併檢視在 petListDataset() 渲染時發生，資料層不動。
 *
 * 前面的優先：兩表同名時（翼龍、幻影那幾隻）以專屬寵物表為準。
 */
const SOURCES: ReadonlyArray<{ file: string; 來源: string }> = [
  { file: '專屬寵物.csv', 來源: '永恆初心專屬' },
  { file: '魔力原始寵物.csv', 來源: '一般寵物' },
];

let cache: PetRecord[] | null = null;
let byName: Map<string, PetRecord> | null = null;
/** 各來源 CSV 的修改時間；dev 改表後會自動重讀，避免入手方法等欄位一直空白 */
let cacheMtimeMs = '';
let extrasCache: Map<string, PetDetailExtra> | null = null;
let extrasMtimeMs = 0;

function loadAll(): PetRecord[] {
  const files = SOURCES.map((s) => ({
    ...s,
    path: join(process.cwd(), 'content', 'data', s.file),
  })).filter((s) => existsSync(s.path));

  const mtime = files.map((s) => `${s.file}:${statSync(s.path).mtimeMs}`).join('|');
  if (cache && mtime === cacheMtimeMs) return cache;

  const merged: PetRecord[] = [];
  const seen = new Map<string, PetRecord>();
  for (const s of files) {
    const text = readFileSync(s.path, 'utf8').replace(/^\uFEFF/, '');
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as PetRecord[];
    for (const r of records) {
      const name = (r.名稱 ?? '').trim();
      if (!name || seen.has(name)) continue;
      r.來源 = s.來源;
      seen.set(name, r);
      merged.push(r);
    }
  }
  cache = merged;
  byName = seen;
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

/** 是否有這隻寵的資料列（合成樹連結用，對齊 items 的 hasItem） */
export function hasPet(name: string): boolean {
  return !!getPet(name.trim());
}

/**
 * 寵物清單頁的合併檢視：兩張來源表串成一個 Dataset 交給 DataTable。
 * 「來源」欄跟著每一列，清單頁才能用分頁籤篩選、在全部檢視幫初心列上色；
 * 欄序照專屬寵物表的習慣，一般寵缺的欄（技能／公告…）就空著。
 */
export function petListDataset(): Dataset {
  const columns = [
    '名稱', '來源', '種族', '體力', '力量', '防禦', '速度', '魔法',
    '技格', '總檔', '屬性', '技能', '公告日', '公告連結', '任務用途',
    '入手方法', '入手類型',
  ];
  const rows = listPets().map((r) => ({
    ...r,
    // 一般寵物表沒有 image 欄，走預設路徑；檔案不存在就空著（不出破圖）
    image: petImagePath(r.名稱, r.image),
  }));
  return {
    name: '寵物清單',
    columns: [...columns, 'image'],
    rows,
    imageColumn: 'image',
    filterColumn: { name: '來源', values: SOURCES.map((s) => s.來源) },
    wrapColumns: pickWrapColumns(columns, rows),
    noteColumn: '任務用途',
    action: {
      label: '算檔次',
      column: '名稱',
      url: (v) => `https://cg-originmood-dc.github.io/monster-remake/?q=${encodeURIComponent(v)}`,
    },
    defaultSort: null,
  };
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

/**
 * 是否有任何寵物持有此技能（skillScope 判共用技能用）。
 * skillScope 對站上每一條技能連結都會問一次，這裡以技能頁名稱做快取，
 * 寵物 CSV 更新（cacheMtimeMs 變動）時整批失效。
 */
let holderFlagCache = new Map<string, boolean>();
let holderFlagMtime = '';

export function anyPetHasSkill(skillPageName: string): boolean {
  loadAll();
  if (holderFlagMtime !== cacheMtimeMs) {
    holderFlagCache = new Map();
    holderFlagMtime = cacheMtimeMs;
  }
  const key = skillPageName.trim();
  const hit = holderFlagCache.get(key);
  if (hit !== undefined) return hit;
  const v = listPets().some((p) => splitSkills(p.技能).some((sk) => skillMatchesPage(sk, key)));
  holderFlagCache.set(key, v);
  return v;
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

  if (existsSync(file)) {
    let raw: Record<string, PetDetailExtra>;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      // 這檔現在裝的是真資料（風之使徒的合成樹在裡面），
      // 壞 JSON 靜默略過等於整包補充資料無聲消失，寧可讓 build 停下來。
      throw new Error(`content/data/寵物詳情補充.json 不是合法 JSON：${e}`);
    }
    for (const [name, extra] of Object.entries(raw)) {
      extrasCache.set(name, extra);
    }
  }
  return extrasCache;
}

export function getPetExtra(name: string): PetDetailExtra {
  return loadExtras().get(name) ?? {};
}

/**
 * public/ 底下真的有這個檔嗎。
 * 合成樹會帶到沒有圖的底寵，組得出路徑不代表檔案在，
 * 給不存在的路徑等於讓每張破圖各發一次 404。外連（http…）不在這裡管。
 */
const localImageCache = new Map<string, boolean>();
function localImageExists(path: string): boolean {
  if (!path.startsWith('/')) return true;
  const hit = localImageCache.get(path);
  if (hit !== undefined) return hit;
  const ok = existsSync(join(process.cwd(), 'public', path.slice(1)));
  localImageCache.set(path, ok);
  return ok;
}

/**
 * 寵物圖 SSOT：只認「專屬寵物」CSV 該寵列的 image。
 * - 有 CSV 列且 image 有值 → 用那格（與專屬寵物列表同一來源）
 * - 否則 → `/img/專屬寵物/{名稱}.gif`（不借用其他寵、不做模糊 fallback）
 * - 檔案不在就回空字串，讓 UI 走既有的文字佔位，不要吐一個必定 404 的路徑
 * `fromCsv` 僅在呼叫端已持有同一列時可傳入，避免重複查表；仍以該寵自己的路徑為準。
 */
export function petImagePath(name: string, fromCsv?: string): string {
  const n = (name ?? '').trim();
  if (!n) return '';
  const fromRow = (fromCsv ?? getPet(n)?.image ?? '').trim();
  const path = fromRow || `/img/專屬寵物/${n}.gif`;
  return localImageExists(path) ? path : '';
}

/** 收集樹上所有寵物名稱 */
export function collectPetNamesInTree(node: FusionNode, out = new Set<string>()): Set<string> {
  if (node.type === 'pet' && node.name) out.add(node.name);
  for (const h of node.heads ?? []) collectPetNamesInTree(h, out);
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
  const heads = node.heads?.map(applyPetImagesFromSsot);
  const base: FusionNode = {
    ...node,
    ...(children ? { children } : {}),
    ...(heads ? { heads } : {}),
  };
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
 *
 * 統一圖管線（見 src/lib/fusion/）：
 * - 各來源 adapter → FusionReaction → compile 成圖
 * - 顯示：反向找全部根 → 各根向下完整展開（不挑主配方）
 * - 手寫 extras 的 fusionTree 拆成反應邊入圖，不再整棵覆蓋
 */
function treeHasBody(node: FusionNode | null | undefined): boolean {
  if (!node) return false;
  return Boolean(node.children?.length || node.heads?.length);
}

let fusionHandwrittenHooked = false;

/** 把 extras 手寫樹注入合成圖（整站建置期間只掛一次） */
function ensureFusionGraphHandwritten(): void {
  if (fusionHandwrittenHooked) return;
  fusionHandwrittenHooked = true;
  setHandwrittenFusionTrees(() => {
    const extras = loadExtras();
    const trees: FusionNode[] = [];
    for (const extra of extras.values()) {
      if (extra.fusionTree && treeHasBody(extra.fusionTree)) {
        trees.push(extra.fusionTree);
      }
    }
    return trees;
  });
}

export function resolveFusionTree(
  petName: string,
  image: string,
): { tree: FusionNode; hasFullData: boolean } {
  ensureFusionGraphHandwritten();

  const fromGraph = buildFusionTreeFromGraph(petName);
  if (fromGraph && treeHasBody(fromGraph)) {
    return { tree: applyPetImagesFromSsot(fromGraph), hasFullData: true };
  }

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
