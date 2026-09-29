/** 此試算只讀自己的費用資料集，不在執行時拼接技能資料或抓 Google 試算表。 */
export interface PetSkillPrice {
  id: string;
  name: string;
  alias: string;
  category: string;
  fee: number;
  note: string;
}
export interface PetSkillPlan { name: string; skills: string[] }
export const MAX_PETS = 15;
export const MAX_SKILLS = 10;
export const PLAN_STORAGE_KEY = 'goodluck:pet-skill-cost:v1';

export function parsePetSkillPrices(rows: Record<string, string>[]): PetSkillPrice[] {
  if (!rows.length) throw new Error('寵物技能費用資料不可為空');
  const ids = new Set<string>();
  return rows.map(r => {
    const fee = Number(r.費用);
    if (!r.代碼 || ids.has(r.代碼) || !r.技能 || !r.原表簡稱 || !r.分類 ||
      !r.費用?.trim() || !Number.isSafeInteger(fee) || fee < 0) {
      throw new Error(`無效的寵物技能費用資料：${r.代碼 ?? ''}`);
    }
    ids.add(r.代碼);
    return { id: r.代碼, name: r.技能, alias: r.原表簡稱, category: r.分類, fee, note: r.備註 || '' };
  });
}

export function blankPetPlan(): PetSkillPlan {
  return { name: '', skills: Array<string>(MAX_SKILLS).fill('') };
}

/** 儲存內容只收名稱與選項，不信任瀏覽器裡的金額。 */
export function restorePetPlans(value: unknown, prices: PetSkillPrice[]): PetSkillPlan[] {
  const state = value as { version?: unknown; pets?: unknown } | null;
  if (!state || state.version !== 1 || !Array.isArray(state.pets) ||
    !state.pets.length || state.pets.length > MAX_PETS) throw new Error('無效的試算內容');
  const ids = new Set(prices.map(s => s.id));
  return state.pets.map((p: unknown) => {
    const pet = p as Partial<PetSkillPlan> | null;
    if (!pet || typeof pet.name !== 'string' || pet.name.length > 60 ||
      !Array.isArray(pet.skills) || pet.skills.length !== MAX_SKILLS) throw new Error('無效的寵物資料');
    const seen = new Set<string>();
    for (const id of pet.skills) {
      if (typeof id !== 'string' || (id && (!ids.has(id) || seen.has(id)))) throw new Error('無效或重複的技能');
      if (id) seen.add(id);
    }
    return { name: pet.name, skills: [...pet.skills] };
  });
}

export function petPlanTotal(pet: PetSkillPlan, prices: PetSkillPrice[]): number {
  const fees = new Map(prices.map(s => [s.id, s.fee]));
  return [...new Set(pet.skills.filter(Boolean))].reduce((total, id) => {
    const fee = fees.get(id);
    if (fee === undefined) throw new Error(`未知技能：${id}`);
    return total + fee;
  }, 0);
}
