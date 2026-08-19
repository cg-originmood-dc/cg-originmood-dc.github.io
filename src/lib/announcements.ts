import type { CollectionEntry } from 'astro:content';

export type Announcement = CollectionEntry<'announcements'>;

/**
 * 存檔總覽的網址；單篇頁要連回來，寫死在兩個地方會走鐘。
 * 總覽併進官方大事記頁當分頁籤了，所以要帶 hash 才會停在對的那一頁。
 */
export const ARCHIVE_PAGE = '/官方大事記#公告存檔';

/**
 * 新的排前面。
 * 同一天常常一次貼好幾篇（維護＋活動＋機率），日期分不出先後，
 * 這時看編號——官網的編號是遞增的，數字大的就是後貼的。
 */
export function sortAnnouncements(entries: Announcement[]): Announcement[] {
  return [...entries].sort((a, b) => {
    if (a.data.日期 !== b.data.日期) return a.data.日期 < b.data.日期 ? 1 : -1;
    return Number(b.data.編號) - Number(a.data.編號);
  });
}

export interface AnnouncementYear {
  year: string;
  items: Announcement[];
}

/** 依年份分組（年份新的在前，組內沿用 sortAnnouncements 的順序） */
export function groupByYear(entries: Announcement[]): AnnouncementYear[] {
  const groups = new Map<string, Announcement[]>();
  for (const e of sortAnnouncements(entries)) {
    const year = e.data.日期.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year)!.push(e);
  }
  return [...groups.entries()].map(([year, items]) => ({ year, items }));
}
