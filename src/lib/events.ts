/**
 * 限時活動（content/data/限時活動.csv）的讀取與時間解析。
 *
 * 本站是靜態站、push 才建置，所以「現在是否進行中」一律不在建置期算——
 * 活動開始或結束那天沒人 push，狀態就會停在舊的。這裡只把起訖時間
 * 正規化成帶時區的 ISO 字串交給瀏覽器，狀態由前端當下判斷。
 */
import { loadDataset } from './datasets';

/** 公告寫的都是台灣時間；不標時區的話，海外玩家的瀏覽器會照自己的時區解讀。 */
const TZ = '+08:00';

export interface GameEvent {
  /** 活動系列名（週年慶寵物島…），同系列歷年多期共用 */
  活動: string;
  /** 這一期的名稱（25週年「寵物島慶典」） */
  期別: string;
  /** 起訖的 ISO 字串（含 +08:00），無法解析則為 null */
  start: string | null;
  end: string | null;
  /** 原始寫法，顯示用（2026-07-30 12:00） */
  開始: string;
  結束: string;
  頁面: string;
  公告日: string;
  關聯內容: string;
  官方公告: string;
  備註: string;
}

/**
 * 「2026-07-30 12:00」→「2026-07-30T12:00:00+08:00」。
 * 只寫日期（沒有時間）時補 00:00，結束日則由呼叫端自行決定要不要算整天。
 */
function toIso(raw: string): string | null {
  const v = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00'] = m;
  return `${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi}:00${TZ}`;
}

/** 全部活動；沒有這張表（或還沒建）時回空陣列，畫面自然不顯示。 */
export function listEvents(): GameEvent[] {
  const ds = loadDataset('限時活動');
  return (ds?.rows ?? []).map((r) => ({
    活動: (r['活動'] ?? '').trim(),
    期別: (r['期別'] ?? '').trim(),
    start: toIso(r['開始'] ?? ''),
    end: toIso(r['結束'] ?? ''),
    開始: (r['開始'] ?? '').trim(),
    結束: (r['結束'] ?? '').trim(),
    頁面: (r['頁面'] ?? '').trim(),
    公告日: (r['公告日'] ?? '').trim(),
    關聯內容: (r['關聯內容'] ?? '').trim(),
    官方公告: (r['官方公告'] ?? '').trim(),
    備註: (r['備註'] ?? '').trim(),
  }));
}

/** 某個活動系列的各期，新的在前（照開始時間排） */
export function eventsOf(活動: string): GameEvent[] {
  return listEvents()
    .filter((e) => e.活動 === 活動)
    .sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
}
