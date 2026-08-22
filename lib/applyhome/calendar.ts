import "server-only";

import { fetchAptDetailPage } from "@/lib/applyhome/adapters/apt-detail";
import { isApplyhomeConfigured } from "@/lib/applyhome/odcloud-client";

/* [개선 #17, 2026-08-22] 이번 주 청약 캘린더 데이터.
 *
 * 청약홈 분양정보(상세) 행에는 접수 시작·마감일이 이미 들어온다(실연동 확인,
 * 총 5.4만 공고). "이번 주 청약"은 매주 새로 생기는 검색 수요인데 전용 표면이
 * 없어서, 접수 임박 공고를 날짜별로 묶어 주는 로더를 만든다.
 * 최신 공고 위주로 두 페이지(200건)를 받아 [오늘-7일, 오늘+35일] 창에 드는
 * 것만 남긴다 — 접수는 공고 후 몇 주 안에 몰리므로 이 창이 실질 전부를 잡는다.
 */

export type ApplyCalendarItem = {
  houseName: string;
  region: string;
  houseKind: string | null;
  /** YYYY-MM-DD */
  receiptStart: string | null;
  receiptEnd: string | null;
  announceDate: string | null;
  portalUrl: string | null;
};

export type ApplyCalendarDay = {
  /** YYYY-MM-DD */
  date: string;
  /** 이 날짜에 접수 "시작"하는 공고 */
  starts: ApplyCalendarItem[];
  /** 이 날짜에 접수 "마감"하는 공고 */
  ends: ApplyCalendarItem[];
};

export type ApplyCalendarResult =
  | { state: "ok"; days: ApplyCalendarDay[]; fetchedAt: string; totalInWindow: number }
  | { state: "unconfigured" }
  | { state: "error"; cause: string };

function normDate(raw?: string): string | null {
  if (!raw) return null;
  const d = raw.replace(/[^0-9]/g, "");
  if (d.length < 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export async function buildApplyCalendar(): Promise<ApplyCalendarResult> {
  if (!isApplyhomeConfigured()) return { state: "unconfigured" };
  try {
    /* 최신 공고부터 두 페이지 — 상세 API 는 공고 등록순으로 최신이 앞에 온다
       (실측: page 1 에 이번 주 접수 공고가 옴). */
    const pages = await Promise.all([
      fetchAptDetailPage({ page: 1, perPage: 100 }),
      fetchAptDetailPage({ page: 2, perPage: 100 }),
    ]);
    const rows = pages.flatMap((p) => p.rows);

    const today = new Date();
    const kstNow = new Date(today.getTime() + 9 * 3600_000);
    const todayStr = kstNow.toISOString().slice(0, 10);
    const winStart = new Date(kstNow.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
    const winEnd = new Date(kstNow.getTime() + 35 * 86400_000).toISOString().slice(0, 10);

    const byDate = new Map<string, ApplyCalendarDay>();
    const dayOf = (date: string): ApplyCalendarDay => {
      let d = byDate.get(date);
      if (!d) {
        d = { date, starts: [], ends: [] };
        byDate.set(date, d);
      }
      return d;
    };

    let totalInWindow = 0;
    for (const r of rows) {
      const start = normDate(r.RCEPT_BGNDE);
      const end = normDate(r.RCEPT_ENDDE);
      if (!start && !end) continue;
      const inWindow =
        (start && start >= winStart && start <= winEnd) ||
        (end && end >= winStart && end <= winEnd);
      if (!inWindow) continue;
      totalInWindow += 1;
      const item: ApplyCalendarItem = {
        houseName: r.HOUSE_NM ?? "단지명 미제공",
        region: r.SUBSCRPT_AREA_CODE_NM ?? "지역 미제공",
        houseKind: r.HOUSE_SECD_NM ?? null,
        receiptStart: start,
        receiptEnd: end,
        announceDate: normDate(r.RCRIT_PBLANC_DE),
        portalUrl: r.PBLANC_URL ?? null,
      };
      if (start && start >= todayStr && start <= winEnd) dayOf(start).starts.push(item);
      if (end && end >= todayStr && end <= winEnd) dayOf(end).ends.push(item);
    }

    const days = [...byDate.values()]
      .filter((d) => d.starts.length > 0 || d.ends.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    return { state: "ok", days, fetchedAt: new Date().toISOString(), totalInWindow };
  } catch (e) {
    return { state: "error", cause: e instanceof Error ? e.message : String(e) };
  }
}
