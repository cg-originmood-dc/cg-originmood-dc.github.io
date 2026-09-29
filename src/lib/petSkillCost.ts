/** 此試算只讀自己的費用資料集，不在執行時拼接技能資料或抓 Google 試算表。 */
export interface PetSkillPrice {
  id: string;
  name: string;
  alias: string;
  category: string;
  fee: number;
  note: string;
}
export interface PetSkillPlan { name: string; skills: string[]; known: string[]; preset: string }
export interface PetSkillPreset { name: string; slots: number | null; skills: string[] }
export const MAX_PETS = 15;
export const MAX_SKILLS = 13;
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
  return { name: '', skills: Array<string>(MAX_SKILLS).fill(''), known: Array<string>(MAX_SKILLS).fill(''), preset: '' };
}

export function planFromPreset(preset: PetSkillPreset): PetSkillPlan {
  if (preset.skills.length > MAX_SKILLS) throw new Error('寵物技能超過欄位上限');
  const pet = blankPetPlan();
  pet.name = pet.preset = preset.name;
  preset.skills.forEach((skill, i) => { pet.known[i] = skill; });
  return pet;
}

/** 儲存內容只收名稱與選項，不信任瀏覽器裡的金額。 */
export function restorePetPlans(value: unknown, prices: PetSkillPrice[]): PetSkillPlan[] {
  const state = value as { version?: unknown; pets?: unknown } | null;
  if (!state || ![1, 2].includes(state.version as number) || !Array.isArray(state.pets) ||
    !state.pets.length || state.pets.length > MAX_PETS) throw new Error('無效的試算內容');
  const ids = new Set(prices.map(s => s.id));
  return state.pets.map((p: unknown) => {
    const pet = p as Partial<PetSkillPlan> | null;
    if (!pet || typeof pet.name !== 'string' || pet.name.length > 60 ||
      !Array.isArray(pet.skills) || !(state.version === 1 ? [10, MAX_SKILLS] : [MAX_SKILLS]).includes(pet.skills.length)) throw new Error('無效的寵物資料');
    const seen = new Set<string>();
    for (const id of pet.skills) {
      if (typeof id !== 'string' || (id && (!ids.has(id) || seen.has(id)))) throw new Error('無效或重複的技能');
      if (id) seen.add(id);
    }
    const known = state.version === 1 ? Array<string>(MAX_SKILLS).fill('') : pet.known;
    const preset = state.version === 1 ? '' : pet.preset;
    if (typeof preset !== 'string' || preset.length > 60 || !Array.isArray(known) || known.length !== MAX_SKILLS ||
      known.some((label, i) => typeof label !== 'string' || label.length > 120 || (!!label && !!pet.skills![i]))) {
      throw new Error('無效的已學技能');
    }
    return { name: pet.name, skills: [...pet.skills, ...Array<string>(MAX_SKILLS - pet.skills.length).fill('')], known: [...known], preset };
  });
}

export interface TempleSkillPrice { name: string; level: number; fee: number; fromLevel: number; cumulative: number }

/** 對同一技能的連續等級加總；缺級不可默認為零，也不與樹海價目相加。 */
export function templeSkillPrices(rows: Record<string, string>[]): TempleSkillPrice[] {
  const last = new Map<string, TempleSkillPrice>();
  return rows.map(r => {
    const name = r.技能, level = Number(r.等級), fee = Number(r.費用), prev = last.get(name);
    if (!name || !r.費用?.trim() || !Number.isSafeInteger(level) || level < 1 ||
      !Number.isSafeInteger(fee) || fee < 0 || (prev && level !== prev.level + 1)) throw new Error('聖殿卷價目等級或費用有誤');
    const result = { name, level, fee, fromLevel: prev?.fromLevel ?? level, cumulative: (prev?.cumulative ?? 0) + fee };
    last.set(name, result);
    return result;
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
