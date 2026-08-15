/**
 * 精神衝擊波工作公式。等級常數來自 content/data/精神衝擊波等級常數.csv。
 *
 * 有效攻擊 = ⌊精神 × 倍率 + 基礎G⌋
 * 傷害中心 = 有效攻擊² / (⌊有效攻擊/3⌋ + max(防禦, 1))
 * 畫面 = ⌊r×傷害中心⌋，r ≈ 0.90…1.10
 */
export interface ShockwaveLevel {
  等級: number;
  精神倍率: number;
  基礎G: number;
}

export function parseShockwaveLevels(
  rows: Record<string, string>[],
): ShockwaveLevel[] {
  return rows
    .map((r) => ({
      等級: Number(r.等級),
      精神倍率: Number(String(r.精神倍率 ?? '').replace('%', '')),
      基礎G: Number(r.基礎G),
    }))
    .filter((r) => Number.isFinite(r.等級) && Number.isFinite(r.基礎G))
    .sort((a, b) => a.等級 - b.等級);
}

export function shockwaveAttack(mind: number, level: number, baseG: number): number {
  const g100 = Math.round(baseG * 100);
  return Math.floor(((60 + 2 * level) * mind + g100) / 100);
}

export function shockwaveRaw(attack: number, defense: number): number {
  const de = Math.max(defense, 1);
  return (attack * attack) / (Math.floor(attack / 3) + de);
}

export function shockwaveDisplay(raw: number, rate = 1): number {
  return Math.floor(rate * raw);
}
