/**
 * 全來源寵物名正規化（別名 → 正式名）
 * 新別名加在對應來源表，此處統一套用。
 */
import { MILITARY_PRODUCT_ALIASES } from '../militaryLabData';
import { REMODEL_PET_ALIASES } from '../remodelVendorData';

/** 全站共用錯字／舊名（不屬於單一來源） */
const GLOBAL_PET_ALIASES: Record<string, string> = {
  /** 舊檔名／錯字：毆 → 歐 */
  毆茲那克: '歐茲那克',
  /** 公告偶發把「那克」寫成「尼克」（熊弟線） */
  酒仙歐茲尼克: '酒仙歐茲那克',
  羅剎歐茲尼克: '羅剎歐茲那克',
};

const ALIASES: Record<string, string> = {
  ...GLOBAL_PET_ALIASES,
  ...MILITARY_PRODUCT_ALIASES,
  ...REMODEL_PET_ALIASES,
};

export function normalizePetName(name: string): string {
  const n = (name ?? '').trim();
  if (!n) return n;
  return ALIASES[n] ?? n;
}
