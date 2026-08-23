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
  /** [#109] 당첨자 발표일 — 지난 주 페이지의 "결과" 표시 */
  winnerDate: string | null;
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
        winnerDate: normDate(r.PRZWNER_PRESNATN_DE),
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

/* ── [#53] 주간 아카이브 — ISO 주차 단위 고정 URL 용 ───────────────────────
 * "8월 마지막주 청약"류 검색을 받는 주 단위 페이지의 데이터. 상세 API 는 최신
 * 공고가 앞이므로 4페이지(400건)로 최근 수 주를 충분히 덮는다(실측: 주간 공고
 * 수십 건). 범위 밖(너무 오래된 주)은 items 가 비고, 페이지가 그 사실을 그대로
 * 말한다 — 없는 데이터를 있는 척하지 않는다. */

export type ApplyWeekRange = { start: string; end: string };

/** "2026-w35" → 그 ISO 주의 월~일 (KST, YYYY-MM-DD). 형식 오류면 null. */
export function parseWeekSlug(slug: string): ApplyWeekRange | null {
  const m = /^(\d{4})-w(\d{1,2})$/i.exec(slug.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  // ISO 8601: 1월 4일이 포함된 주가 1주차. 그 주의 월요일을 기준점으로 잡는다.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7; // 월=1 … 일=7
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(monday), end: iso(sunday) };
}

/** KST 기준 오늘이 속한 ISO 주차 슬러그 ("2026-w35"). offsetWeeks 로 이전/다음 주. */
export function weekSlugFor(offsetWeeks = 0): string {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + offsetWeeks * 7);
  // ISO 주차: 목요일 규칙
  const target = new Date(d);
  const dow = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear()}-w${week}`;
}

export type ApplyWeekResult =
  | { state: "ok"; days: ApplyCalendarDay[]; range: ApplyWeekRange; totalInWeek: number }
  | { state: "unconfigured" }
  | { state: "error"; cause: string };

export async function buildApplyWeek(slugOrRange: string | ApplyWeekRange): Promise<ApplyWeekResult | null> {
  const range = typeof slugOrRange === "string" ? parseWeekSlug(slugOrRange) : slugOrRange;
  if (!range) return null;
  if (!isApplyhomeConfigured()) return { state: "unconfigured" };
  try {
    const pages = await Promise.all(
      [1, 2, 3, 4].map((page) => fetchAptDetailPage({ page, perPage: 100 })),
    );
    const rows = pages.flatMap((p) => p.rows);
    const byDate = new Map<string, ApplyCalendarDay>();
    const dayOf = (date: string): ApplyCalendarDay => {
      let d = byDate.get(date);
      if (!d) {
        d = { date, starts: [], ends: [] };
        byDate.set(date, d);
      }
      return d;
    };
    let totalInWeek = 0;
    for (const r of rows) {
      const start = normDate(r.RCEPT_BGNDE);
      const end = normDate(r.RCEPT_ENDDE);
      if (!start && !end) continue;
      const startIn = start !== null && start >= range.start && start <= range.end;
      const endIn = end !== null && end >= range.start && end <= range.end;
      if (!startIn && !endIn) continue;
      totalInWeek += 1;
      const item: ApplyCalendarItem = {
        houseName: r.HOUSE_NM ?? "단지명 미제공",
        region: r.SUBSCRPT_AREA_CODE_NM ?? "지역 미제공",
        houseKind: r.HOUSE_SECD_NM ?? null,
        receiptStart: start,
        receiptEnd: end,
        announceDate: normDate(r.RCRIT_PBLANC_DE),
        winnerDate: normDate(r.PRZWNER_PRESNATN_DE),
        portalUrl: r.PBLANC_URL ?? null,
      };
      if (startIn && start) dayOf(start).starts.push(item);
      if (endIn && end) dayOf(end).ends.push(item);
    }
    const days = [...byDate.values()]
      .filter((d) => d.starts.length > 0 || d.ends.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    return { state: "ok", days, range, totalInWeek };
  } catch (e) {
    return { state: "error", cause: e instanceof Error ? e.message : String(e) };
  }
}
