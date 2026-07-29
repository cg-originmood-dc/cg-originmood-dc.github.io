/**
 * 寵物素質計算公式
 * 來源：永恆初心寵物算檔器 (cg-pet-calculator-cloudflare.pages.dev/js/logic.js)
 *
 * 橫向 BP：體 力 強 速 魔
 * 直向素質：血 魔 攻 防 敏 精 回
 */

/** BP → 素質轉換矩陣 */
export const STAT_MATRIX: number[][] = [
  [8, 2, 3, 3, 1], // HP
  [1, 2, 2, 2, 10], // MP
  [0.2, 2.7, 0.3, 0.3, 0.2], // Atk
  [0.2, 0.3, 3, 0.3, 0.2], // Def
  [0.1, 0.2, 0.2, 2, 0.1], // Agi
  [-0.3, -0.1, 0.2, -0.1, 0.8], // Spt 精神
  [0.8, -0.1, -0.1, 0.2, -0.3], // Rec 回復
];

const BASE = 20;

/** 成長檔 → 每升 1 級獲得的 BP 係數 */
const FULL_RATES: Record<number, number> = {
  0: 0, 1: 0.04, 2: 0.08, 3: 0.12, 4: 0.16, 5: 0.205,
  6: 0.25, 7: 0.29, 8: 0.33, 9: 0.37, 10: 0.415,
  11: 0.46, 12: 0.5, 13: 0.54, 14: 0.58, 15: 0.625,
  16: 0.67, 17: 0.71, 18: 0.75, 19: 0.79, 20: 0.835,
  21: 0.88, 22: 0.92, 23: 0.96, 24: 1.0, 25: 1.045,
  26: 1.09, 27: 1.13, 28: 1.17, 29: 1.21, 30: 1.255,
  31: 1.3, 32: 1.34, 33: 1.38, 34: 1.42, 35: 1.465,
  36: 1.51, 37: 1.55, 38: 1.59, 39: 1.63, 40: 1.675,
  41: 1.72, 42: 1.76, 43: 1.8, 44: 1.84, 45: 1.885,
  46: 1.93, 47: 1.97, 48: 2.01, 49: 2.05, 50: 2.095,
  51: 2.14, 52: 2.18,
};

export function getGrowRate(grow: number): number {
  const g = Math.max(0, Math.min(52, Math.floor(grow)));
  return FULL_RATES[g] ?? 0;
}

export interface PetBpGrow {
  /** 體 力 強 速 魔 */
  body: number;
  str: number;
  vit: number; // 強度
  spd: number;
  mag: number;
}

export interface PetCombatStats {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  agi: number;
  spt: number;
  rec: number;
}

export function bpToStats(bp: number[]): PetCombatStats {
  const calc = (row: number) => {
    let sum = 0;
    for (let i = 0; i < 5; i++) sum += STAT_MATRIX[row][i] * bp[i];
    return sum;
  };
  return {
    hp: calc(0) + BASE,
    mp: calc(1) + BASE,
    atk: calc(2) + BASE,
    def: calc(3) + BASE,
    agi: calc(4) + BASE,
    spt: calc(5) + 100,
    rec: calc(6) + 100,
  };
}

/**
 * 計算指定等級素質（預設：無隨機檔、無手動配點、成長率 20%）
 */
export function calculatePetStats(
  grow: number[],
  level: number,
  options?: {
    randomGrow?: number[];
    manualPoints?: number[];
    bpRate?: number;
  },
): PetCombatStats {
  const randomGrow = options?.randomGrow ?? [0, 0, 0, 0, 0];
  const manualPoints = options?.manualPoints ?? [0, 0, 0, 0, 0];
  const bpRate = options?.bpRate ?? 0.2;
  const lvldiff = Math.max(0, level - 1);

  const actualBp = grow.map((g, i) => {
    const initBp = (g + (randomGrow[i] ?? 0)) * bpRate;
    const lvlUpBp = getGrowRate(g) * lvldiff;
    return initBp + lvlUpBp + (manualPoints[i] ?? 0);
  });

  return bpToStats(actualBp);
}

export function roundStat(n: number): number {
  return Math.floor(n);
}

/** 從 CSV 檔次欄位解析五圍成長檔 */
export function parseGrowFromPet(pet: {
  體力?: string;
  力量?: string;
  防禦?: string;
  速度?: string;
  魔法?: string;
}): number[] | null {
  const keys = ['體力', '力量', '防禦', '速度', '魔法'] as const;
  const nums = keys.map((k) => {
    const raw = String(pet[k] ?? '').replace(/[^\d.]/g, '');
    return raw === '' ? NaN : Number(raw);
  });
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

/** 給前端用的精簡序列化（rates 表 + matrix） */
export function clientFormulaPayload() {
  return {
    matrix: STAT_MATRIX,
    base: BASE,
    rates: FULL_RATES,
    bpRate: 0.2,
  };
}
