/**
 * 技能詳情頁的站內相關連結。資料在 content/data/技能相關頁面.csv，
 * 一列一個「技能 → 路徑」，畫面只負責 loop。
 */
import { loadDataset } from './datasets';

export interface SkillRelatedPage {
  href: string;
  label: string;
}

export function skillRelatedPages(skillName: string): SkillRelatedPage[] {
  const ds = loadDataset('技能相關頁面');
  const key = skillName.trim();
  if (!ds || !key) return [];
  return ds.rows
    .filter((r) => (r.技能 ?? '').trim() === key && (r.路徑 ?? '').trim())
    .map((r) => ({
      href: (r.路徑 ?? '').trim(),
      label: (r.標籤 ?? '').trim() || (r.路徑 ?? '').trim(),
    }));
}
