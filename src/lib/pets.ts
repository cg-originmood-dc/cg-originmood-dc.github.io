import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { buildFusionTreeFromGraph } from './fusionGraph';
import { loadFusionLibraryFile } from './fusion/library';
import { itemImagePath } from './items';
import { pickWrapColumns, type Dataset } from './datasets';

export type PetCatalog = 'exclusive' | 'native';

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
  /** exclusive=專屬寵物；native=原生寵物（蔚藍圖鑑 001–175） */
  _catalog?: PetCatalog;
  [key: string]: string | undefined;
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
  /** NPC / 座標；可含等級前綴如「40等@聖巫羅莎」「任意@…」 */
  npc?: string;
  /** 材料寵最低等級（展示用；通常已併入 npc） */
  minLevel?: number;
  /** 材料為任意等級 */
  anyLevel?: boolean;
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

let exclusiveCache: PetRecord[] | null = null;
let exclusiveByName: Map<string, PetRecord> | null = null;
let exclusiveMtime = 0;

let nativeCache: PetRecord[] | null = null;
let nativeByName: Map<string, PetRecord> | null = null;
let nativeMtime = 0;

function loadCsvPets(
  relativePath: string,
  catalog: PetCatalog,
): { rows: PetRecord[]; mtime: number } {
  const file = join(process.cwd(), relativePath);
  if (!existsSync(file)) return { rows: [], mtime: 0 };
  const mtime = statSync(file).mtimeMs;
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as PetRecord[];
  const rows = records
    .filter((r) => (r.名稱 ?? '').trim())
    .map((r) => ({ ...r, _catalog: catalog }));
  return { rows, mtime };
}

function loadExclusive(): PetRecord[] {
  const file = join(process.cwd(), 'content', 'data', '專屬寵物.csv');
  const mtime = existsSync(file) ? statSync(file).mtimeMs : 0;
  if (exclusiveCache && mtime === exclusiveMtime) return exclusiveCache;
  const { rows, mtime: mt } = loadCsvPets('content/data/專屬寵物.csv', 'exclusive');
  exclusiveCache = rows;
  exclusiveByName = new Map(rows.map((r) => [r.名稱.trim(), r]));
  exclusiveMtime = mt;
  return exclusiveCache;
}

function loadNative(): PetRecord[] {
  const file = join(process.cwd(), 'content', 'data', '原生寵物.csv');
  const mtime = existsSync(file) ? statSync(file).mtimeMs : 0;
  if (nativeCache && mtime === nativeMtime) return nativeCache;
  const { rows, mtime: mt } = loadCsvPets('content/data/原生寵物.csv', 'native');
  nativeCache = rows;
  nativeByName = new Map(rows.map((r) => [r.名稱.trim(), r]));
  nativeMtime = mt;
  return nativeCache;
}

/** 專屬寵物列表（技能持有者、專屬列表頁） */
export function listPets(): PetRecord[] {
  return loadExclusive();
}

/** 原生寵物（蔚藍圖鑑 001–175） */
export function listNativePets(): PetRecord[] {
  return loadNative();
}

/**
 * 詳情靜態路徑用：專屬 + 原生（名稱重複時只留專屬，避免雙路徑）
 */
export function listPetsForDetailPaths(): PetRecord[] {
  const exclusive = loadExclusive();
  const native = loadNative();
  const names = new Set(exclusive.map((p) => p.名稱.trim()));
  return [...exclusive, ...native.filter((p) => !names.has(p.名稱.trim()))];
}

/**
 * 查寵物：優先專屬，沒有再原生。
 * 合成樹／詳情／圖檔都走這裡。
 */
export function getPet(name: string): PetRecord | null {
  const n = (name ?? '').trim();
  if (!n) return null;
  loadExclusive();
  loadNative();
  return exclusiveByName?.get(n) ?? nativeByName?.get(n) ?? null;
}

/** 是否有這隻寵物的正式資料列（表格與合成樹連結共用）。 */
export function hasPet(name: string): boolean {
  return !!getPet(name);
}

/**
 * 寵物清單頁的合併檢視：專屬寵物與原生寵物共用 DataTable。
 * 正式寵物詳情仍由各自的 CSV 載入；這裡只在展示邊界組合列，不建立第二份 SSOT。
 */
export function petListDataset(): Dataset {
  const columns = [
    '名稱', '來源', '種族', '體力', '力量', '防禦', '速度', '魔法',
    '技格', '總檔', '屬性', '技能', '公告日', '公告連結', '任務用途',
    '入手方法', '入手類型',
  ];
  const rows: Record<string, string>[] = listPetsForDetailPaths().map((pet) => {
    const row: Record<string, string> = {};
    for (const column of columns) row[column] = pet[column] ?? '';
    row.來源 = pet._catalog === 'native' ? '一般寵物' : '永恆初心專屬';
    row.image = petImagePath(pet.名稱, pet.image);
    return row;
  });

  return {
    name: '寵物清單',
    columns: [...columns, 'image'],
    rows,
    imageColumn: 'image',
    filterColumn: { name: '來源', values: ['永恆初心專屬', '一般寵物'] },
    wrapColumns: pickWrapColumns(columns, rows),
    noteColumn: '任務用途',
    action: {
      label: '算檔次',
      column: '名稱',
      url: (value) =>
        `https://cg-originmood-dc.github.io/monster-remake/?q=${encodeURIComponent(value)}`,
    },
    defaultSort: null,
  };
}

export function getPetCatalog(name: string): PetCatalog | null {
  return getPet(name)?._catalog ?? null;
}

export function petCatalogLabel(catalog?: PetCatalog | null): string {
  if (catalog === 'native') return '原生寵物';
  if (catalog === 'exclusive') return '專屬寵物';
  return '寵物';
}

export function petStatKeys(): readonly string[] {
  return STAT_KEYS;
}

/** 將標準技能字串拆成個別技能。 */
export function splitSkills(raw: string): string[] {
  return raw
    .split('、')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 是否為 SP 變體標籤（無 LV）：突襲之舞SP、突襲之舞SP1…
 * 資料層必須已寫成「技能名+SP」，不做別名表轉換。
 */
export function isSkillSpVariantLabel(skillToken: string): boolean {
  return /SP\d*$/u.test(skillToken.trim());
}

/**
 * 取出 SP 後綴標籤：突襲之舞SP → SP；裂空斬SP2 → SP2。
 * 非 SP 則 null。
 */
export function skillSpLabel(skillToken: string): string | null {
  const m = skillToken.trim().match(/SP(\d*)$/u);
  if (!m) return null;
  return m[1] ? `SP${m[1]}` : 'SP';
}

/** 從「連擊LV11」「突襲之舞SP」取出技能庫正式名 */
export function skillBaseName(skill: string): string {
  return skill.replace(/(?:LV\d+|SP\d*)$/u, '').trim();
}

/**
 * 判斷寵物技能字串是否對應某個技能頁名稱
 * 例：頁「諸刃」↔「諸刃LV13」；頁「突襲之舞」↔「突襲之舞SP」
 */
export function skillMatchesPage(skillToken: string, pageName: string): boolean {
  return skillBaseName(skillToken) === pageName;
}

export interface PetSkillHolder {
  name: string;
  image: string;
  /** 該寵身上的技能原文，如 諸刃LV13 */
  skillLabel: string;
  /** 從技能字串解析的等級；無法解析則為 null */
  level: number | null;
}

/** 從「連擊LV11」「昏睡攻擊LV12」取出等級數字。 */
export function parseSkillLevel(skillLabel: string): number | null {
  const level = skillLabel.match(/LV(\d+)$/)?.[1];
  return level ? Number(level) : null;
}

/** 技能名 → 持有寵（一次掃描寵物表建索引，避免技能總覽 O(技能×寵) 卡死） */
let skillHoldersIndex: Map<string, PetSkillHolder[]> | null = null;
let skillHoldersIndexMtime = 0;

function getSkillHoldersIndex(): Map<string, PetSkillHolder[]> {
  // 寵物 CSV 變更時重建
  const exclusivePath = join(process.cwd(), 'content', 'data', '專屬寵物.csv');
  const nativePath = join(process.cwd(), 'content', 'data', '原生寵物.csv');
  let mtime = 0;
  if (existsSync(exclusivePath)) mtime = Math.max(mtime, statSync(exclusivePath).mtimeMs);
  if (existsSync(nativePath)) mtime = Math.max(mtime, statSync(nativePath).mtimeMs);
  if (skillHoldersIndex && mtime === skillHoldersIndexMtime) return skillHoldersIndex;

  const index = new Map<string, Map<string, PetSkillHolder>>();
  for (const pet of listPetsForDetailPaths()) {
    const name = (pet.名稱 ?? '').trim();
    if (!name) continue;
    for (const sk of splitSkills(pet.技能)) {
      const base = skillBaseName(sk);
      if (!base) continue;
      const level = parseSkillLevel(sk);
      let byPet = index.get(base);
      if (!byPet) {
        byPet = new Map();
        index.set(base, byPet);
      }
      const prev = byPet.get(name);
      if (!prev || (level ?? -1) > (prev.level ?? -1)) {
        byPet.set(name, {
          name,
          image: petImagePath(name, pet.image),
          skillLabel: sk,
          level,
        });
      }
    }
  }

  skillHoldersIndex = new Map();
  for (const [skill, byPet] of index) {
    const out = [...byPet.values()];
    out.sort((a, b) => {
      const la = a.level ?? 999;
      const lb = b.level ?? 999;
      if (la !== lb) return la - lb;
      return a.name.localeCompare(b.name, 'zh-Hant');
    });
    skillHoldersIndex.set(skill, out);
  }
  skillHoldersIndexMtime = mtime;
  return skillHoldersIndex;
}

/** 從專屬＋原生反查持有某技能的寵物（供技能詳情頁；同名專屬優先已由 getPet 處理） */
export function listPetsWithSkill(skillPageName: string): PetSkillHolder[] {
  const key = (skillPageName ?? '').trim();
  if (!key) return [];
  return (getSkillHoldersIndex().get(key) ?? []).slice();
}

/**
 * 從合成庫反查與該道具有關的寵物（建頁時 parse，不加中間檔）。
 * 放在 pets 避免 items↔pets 循環依賴。
 */
export function listPetsWithItem(itemName: string): PetSkillHolder[] {
  const item = (itemName ?? '').trim();
  if (!item) return [];

  const lib = loadFusionLibraryFile();
  const best = new Map<string, PetSkillHolder & { rank: number }>();

  const upsert = (petName: string, label: string, rank: number) => {
    const n = petName.trim();
    if (!n) return;
    const prev = best.get(n);
    if (prev && prev.rank >= rank) return;
    best.set(n, {
      name: n,
      image: petImagePath(n),
      skillLabel: label,
      level: null,
      rank,
    });
  };

  for (const r of lib.reactions) {
    const asMat = r.materials.some((m) => m.kind === 'item' && m.symbol === item);
    const asProd = r.products.some((p) => p.kind === 'item' && p.symbol === item);
    if (!asMat && !asProd) continue;
    if (asMat) {
      for (const p of r.products) {
        if (p.kind === 'pet' && p.symbol) upsert(p.symbol, '合成產物', 2);
      }
      for (const m of r.materials) {
        if (m.kind === 'pet' && m.symbol) upsert(m.symbol, '合成材料', 1);
      }
    }
    if (asProd) {
      for (const m of r.materials) {
        if (m.kind === 'pet' && m.symbol) upsert(m.symbol, '合成材料', 1);
      }
    }
  }

  const out: PetSkillHolder[] = [...best.values()].map(({ rank: _r, ...h }) => h);
  out.sort((a, b) => {
    const ra = a.skillLabel === '合成產物' ? 0 : 1;
    const rb = b.skillLabel === '合成產物' ? 0 : 1;
    if (ra !== rb) return ra - rb;
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

export function getPetExtra(name: string): PetDetailExtra {
  return name.trim() === '風之使徒' ? WIND_APOSTLE_EXTRA : {};
}

/**
 * 寵物圖：優先該列 image；否則依目錄預設路徑。
 * 查表順序與 getPet 相同（專屬 → 原生）。
 */
export function petImagePath(name: string, fromCsv?: string): string {
  const n = (name ?? '').trim();
  if (!n) return '';
  const pet = getPet(n);
  const fromRow = (fromCsv ?? pet?.image ?? '').trim();
  if (fromRow) return fromRow;
  // 與專屬相同：檔名 = 寵物名稱.gif
  if (pet?._catalog === 'native') return `/img/原生寵物/${n}.gif`;
  return `/img/專屬寵物/${n}.gif`;
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
 * 只讀 content/data/generated/fusion-library.json（npm run fusion:build 產出）。
 * 顯示：反向找全部根 → 各根向下完整展開（不挑主配方）。
 * 禁止在此路徑 parse 寵物合成配方.csv。
 */
function treeHasBody(node: FusionNode | null | undefined): boolean {
  if (!node) return false;
  return Boolean(node.children?.length || node.heads?.length);
}

export function resolveFusionTree(
  petName: string,
  image: string,
): { tree: FusionNode; hasFullData: boolean } {
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
            // 材料由軍方研究所一改接上（enrich）；此處只掛產物節點
            type: 'pet',
            name: '光精靈',
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
