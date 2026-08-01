/**
 * 改造寵購買 NPC／底寵配方查詢（靜態資料 remodelVendorData.ts）
 * 供寵物詳情「入手方法／相關活動／合成樹」使用。
 */
import type { ObtainMethod } from './pets';
import {
  REMODEL_BASE_PETS,
  REMODEL_PET_ALIASES,
  REMODEL_VENDOR_PAGE,
  REMODEL_VENDORS,
  remodelBlueprintItems,
  type RemodelVendor,
  type RemodelVendorPet,
} from './remodelVendorData';

export function normalizeRemodelPetName(name: string): string {
  const n = (name ?? '').trim();
  return REMODEL_PET_ALIASES[n] ?? n;
}

/**
 * 改造產物 → 底寵原名。
 * 1) REMODEL_BASE_PETS 手補表
 * 2) 名稱以「改造」開頭 → 剝前綴（改造貓妖 → 貓妖）
 * 無底寵資料時回 null（例：迷幻歌妖待補）
 */
export function remodelBasePet(productName: string): string | null {
  const name = normalizeRemodelPetName(productName);
  if (!name) return null;
  if (REMODEL_BASE_PETS[name]) return REMODEL_BASE_PETS[name];
  if (name.startsWith('改造') && name.length > 2) {
    return name.slice(2);
  }
  return null;
}

export interface RemodelVendorHit {
  vendor: RemodelVendor;
  pet: RemodelVendorPet;
  /** 對齊後的正式名 */
  canonicalName: string;
}

/**
 * 合成圖用：改造產物配方
 * 原寵 + 改造圖A + 改造圖B + …（grades 展開，不是「改造圖 檔次」）
 */
export interface RemodelFusionRecipe {
  product: string;
  basePet: string;
  /** 如 ["改造圖A","改造圖B","改造圖C"] */
  blueprintItems: string[];
  /** 原始 grades 字串，如 ABCDE */
  grades: string;
  npc: string;
  location?: string;
  quest?: string;
}

const byPet = new Map<string, RemodelVendorHit[]>();
const remodelRecipes: RemodelFusionRecipe[] = [];
const remodelByProduct = new Map<string, RemodelFusionRecipe>();

for (const vendor of REMODEL_VENDORS) {
  for (const pet of vendor.pets) {
    const canonical = normalizeRemodelPetName(pet.name);
    const hit: RemodelVendorHit = {
      vendor,
      pet: { ...pet, name: canonical },
      canonicalName: canonical,
    };
    const list = byPet.get(canonical) ?? [];
    list.push(hit);
    byPet.set(canonical, list);
    // 異名也可查
    if (pet.name !== canonical) {
      const aliasList = byPet.get(pet.name) ?? [];
      aliasList.push(hit);
      byPet.set(pet.name, aliasList);
    }

    const base = remodelBasePet(canonical);
    if (!base) continue;
    // 同一產物多個購買 NPC 時配方相同，只建一條合成邊
    if (remodelByProduct.has(canonical)) continue;
    const blueprints = remodelBlueprintItems(pet.grades, base);
    if (!blueprints.length) continue;
    const recipe: RemodelFusionRecipe = {
      product: canonical,
      basePet: base,
      blueprintItems: blueprints,
      grades: pet.grades,
      npc: vendor.location
        ? `${vendor.npc}（${vendor.location}）`
        : vendor.npc,
      location: vendor.location,
      quest: vendor.quest,
    };
    remodelRecipes.push(recipe);
    remodelByProduct.set(canonical, recipe);
  }
}

for (const [alias, canon] of Object.entries(REMODEL_PET_ALIASES)) {
  if (byPet.has(canon) && !byPet.has(alias)) {
    byPet.set(alias, byPet.get(canon)!);
  }
  if (remodelByProduct.has(canon) && !remodelByProduct.has(alias)) {
    remodelByProduct.set(alias, remodelByProduct.get(canon)!);
  }
}

export function listRemodelVendorHits(petName: string): RemodelVendorHit[] {
  const name = normalizeRemodelPetName(petName);
  return byPet.get(name) ?? byPet.get(petName) ?? [];
}

export function petHasRemodelVendor(petName: string): boolean {
  return listRemodelVendorHits(petName).length > 0;
}

/** 全部「原寵 + 改造圖 → 改造寵」配方（已去重） */
export function listRemodelFusionRecipes(): RemodelFusionRecipe[] {
  return remodelRecipes.slice();
}

export function getRemodelFusionRecipe(
  productPet: string,
): RemodelFusionRecipe | undefined {
  const name = normalizeRemodelPetName(productPet);
  return remodelByProduct.get(name) ?? remodelByProduct.get(productPet);
}

/**
 * 入手細項：購買 NPC + 檔次 + 任務／座標，連回魔力豆知識。
 */
export function remodelVendorObtainMethods(
  petName: string,
  base = '',
): ObtainMethod[] {
  const hits = listRemodelVendorHits(petName);
  if (!hits.length) return [];
  const b = base.replace(/\/$/, '');
  const link = `${b}${REMODEL_VENDOR_PAGE}`;

  return hits.map(({ vendor, pet }) => {
    const noteParts: string[] = [];
    if (vendor.quest) noteParts.push(`任務：${vendor.quest}`);
    const basePet = remodelBasePet(pet.name);
    const maps = basePet ? remodelBlueprintItems(pet.grades, basePet) : [];
    if (basePet && maps.length) {
      noteParts.push(`合成：${basePet} ＋ ${maps.join(' ＋ ')}`);
    } else if (pet.grades) {
      noteParts.push(`設計圖 ${pet.grades.split('').join('/')}`);
    }
    return {
      type: 'exchange',
      map: vendor.location
        ? `${vendor.npc}（${vendor.location}）`
        : vendor.npc,
      note: noteParts.join('；') || undefined,
      link,
    };
  });
}
