/**
 * 設計圖／改造圖檔次展開
 * 「OO設計圖ABCDE」「OO設計圖A-E」→ OO設計圖A … OO設計圖E
 * 已是單檔（OO設計圖A）則原樣。
 */

/** 抓「前綴 + 設計圖/改造圖 + 檔次」 */
const BUNDLE_RE =
  /^(.+?)(設計圖|改造圖)(?:\*|×|x)?\s*([A-Ea-e](?:\s*[-～~到至]\s*[A-Ea-e]|[A-Ea-e]*))$/u;

function expandLetters(token: string): string[] {
  const t = token.replace(/\s+/g, '').toUpperCase();
  // A-E / A～E
  const range = t.match(/^([A-E])[-～~到至]([A-E])$/);
  if (range) {
    const a = range[1]!.charCodeAt(0);
    const b = range[2]!.charCodeAt(0);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const out: string[] = [];
    for (let c = lo; c <= hi; c++) out.push(String.fromCharCode(c));
    return out;
  }
  // ABCDE
  const letters = t.replace(/[^A-E]/g, '').split('');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of letters) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
  }
  return out;
}

/**
 * 若 name 是打包檔次設計圖，拆成多張；否則回傳 [name]。
 * 例：鐮刀魔設計圖ABCDE → [鐮刀魔設計圖A,…,E]
 */
export function expandDesignDrawingName(name: string): string[] {
  const raw = (name ?? '').trim();
  if (!raw) return [];
  // 去掉數量殘留
  const cleaned = raw
    .replace(/[×*xX]\s*\d+\s*$/u, '')
    .replace(/\s+/g, '')
    .trim();
  const m = cleaned.match(BUNDLE_RE);
  if (!m) {
    // 已是單檔 OO設計圖A
    if (/(?:設計圖|改造圖)[A-E]$/u.test(cleaned)) return [cleaned];
    return [raw.trim()];
  }
  const prefix = m[1]!;
  const kind = m[2]!; // 設計圖 | 改造圖
  const letters = expandLetters(m[3]!);
  if (!letters.length) return [raw.trim()];
  // 統一用「設計圖」（官方／道具庫用語）；來源若寫改造圖也轉成設計圖
  const label = kind === '改造圖' ? '設計圖' : kind;
  return letters.map((ch) => `${prefix}${label}${ch}`);
}

/** grades「ABCDE」+ 底寵名 → [底寵設計圖A, …] */
export function designDrawingsForBase(basePet: string, grades: string): string[] {
  const base = (basePet ?? '').trim();
  if (!base) return [];
  const letters = expandLetters((grades ?? '').toUpperCase());
  return letters.map((ch) => `${base}設計圖${ch}`);
}
