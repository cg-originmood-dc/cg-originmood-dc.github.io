/**
 * 精神衝擊波工作公式。等級常數來自 content/data/精神衝擊波等級常數.csv。
 *
 * A = ⌊((60+2L)×精神 + h(L)) / 100⌋
 * X = A² / (⌊A/3⌋ + max(防禦, 1))
 * 畫面 = ⌊r×X⌋，r ≈ 0.90…1.10
 */
export interface ShockwaveLevel {
  等級: number;
  精神係數: number;
  h工作值: number;
}

export function parseShockwaveLevels(
  rows: Record<string, string>[],
): ShockwaveLevel[] {
  return rows
    .map((r) => ({
      等級: Number(r.等級),
      精神係數: Number(r.精神係數),
      h工作值: Number(r.h工作值),
    }))
    .filter((r) => Number.isFinite(r.等級) && Number.isFinite(r.h工作值))
    .sort((a, b) => a.等級 - b.等級);
}

export function shockwaveAttack(mind: number, level: number, h: number): number {
  return Math.floor(((60 + 2 * level) * mind + h) / 100);
}

/** 未取整的中心值 X */
export function shockwaveRaw(attack: number, defense: number): number {
  const de = Math.max(defense, 1);
  return (attack * attack) / (Math.floor(attack / 3) + de);
}

export function shockwaveDisplay(raw: number, rate = 1): number {
  return Math.floor(rate * raw);
}
