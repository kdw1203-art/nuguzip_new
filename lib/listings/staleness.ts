import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import {
  LISTING_STALE_DAYS,
  LISTING_CLOSE_SUGGEST_DAYS,
  listingStaleStage,
  type ListingStaleStage,
} from "@/lib/listings/store-db";

/**
 * I10 — 오래된 매물 소유자에게 보낼 안내 선별.
 *
 * ── 지금 무엇이 비어 있나 ──────────────────────────────────────────
 * 신선도(refreshed_at 기준 21일)는 이미 화면에 있다. /listings/[id] 에 "확인 필요"
 * 배지가 뜨고 소유자에게는 끌어올리기 버튼도 보인다. 문제는 **그 화면을 열어야만
 * 보인다**는 것. 중개사가 실제로 여는 화면은 /my/listings 인데 거기엔 신선도가
 * 아예 없었다. 그래서 오래된 호가가 아무 신호 없이 그대로 남는다.
 *
 * 이 파일은 그 신호를 사람이 찾아오지 않아도 가게 만든다.
 *
 * ── 단계 ───────────────────────────────────────────────────────────
 *  1단계 (21일)  끌어올리기 안내 — "아직 거래 중이면 끌어올려 주세요"
 *  2단계 (60일)  마감 제안       — "끝난 거래라면 마감해 주세요"
 *
 * listings.stale_notice_stage 에 "어디까지 알렸는지"를 남기고, 단계가 **올라갈 때만**
 * 새로 보낸다. 그래서 매물 하나가 받는 알림은 최대 2번이다. 이 상태가 없으면
 * 크론이 도는 날마다 같은 매물로 같은 알림이 나가고, 그건 알림을 끄게 만드는
 * 가장 빠른 길이다.
 *
 * ── 자동 마감은 하지 않는다 ────────────────────────────────────────
 * 갱신이 없다는 사실은 "거래가 끝났다"를 뜻하지 않는다. 그냥 바쁜 중개사일 수도
 * 있다. 남의 매물 상태를 시스템이 바꾸는 것과 바꾸라고 권하는 것은 다른 일이라서,
 * 여기서는 후자만 한다. status 를 바꾸는 건 끝까지 소유자의 클릭이다.
 *
 * ── 사람당 한 통 ───────────────────────────────────────────────────
 * 매물 30건이 같이 낡은 중개사에게 30통을 보내면 그건 알림이 아니라 사고다.
 * 소유자별로 묶어서 한 통만 보내고, 링크는 /my/listings 로 보낸다(거기서
 * 배지와 끌어올리기 버튼을 한 화면에 본다).
 *
 * ── 문구의 근거 ────────────────────────────────────────────────────
 * 본문 숫자는 전부 실제 행에서 나온다(건수 · 경과일). "새 매물이 많아요" 같은
 * 만들어낸 말은 쓰지 않는다.
 */

/** 한 회차에 훑는 매물 수 상한 */
export const STALE_SCAN_LIMIT = 500;

export type StaleListingRow = {
  id: string;
  authorEmail: string;
  complexName: string;
  regionName: string | null;
  /** 신선도 기준시각 — refreshed_at, 없으면 created_at */
  basisAt: string;
  ageDays: number;
  /** 지금 계산한 단계 */
  stage: ListingStaleStage;
  /** 이미 보낸 단계 */
  notifiedStage: number;
};

export type StaleOwnerGroup = {
  userEmail: string;
  title: string;
  body: string;
  actionUrl: string;
  /** 이번 회차에 단계가 올라간 매물만 */
  listings: StaleListingRow[];
  /** 1단계(끌어올리기 안내) 건수 */
  refreshCount: number;
  /** 2단계(마감 제안) 건수 */
  closeCount: number;
};

export type StaleScan = {
  /** 신선도 기준(21일)을 넘긴 매물 수 */
  stale: number;
  /** 그중 단계가 올라가 알릴 거리가 있는 매물 수 */
  escalated: number;
  /** 이미 같은 단계로 알린 적이 있어 건너뛴 매물 수 */
  alreadyNotified: number;
  /** 알림을 끈 소유자 수 / 그 때문에 빠진 매물 수 */
  optedOutOwners: number;
  optedOutListings: number;
  owners: StaleOwnerGroup[];
  reason?: string;
};

const emptyScan = (reason?: string): StaleScan => ({
  stale: 0,
  escalated: 0,
  alreadyNotified: 0,
  optedOutOwners: 0,
  optedOutListings: 0,
  owners: [],
  ...(reason ? { reason } : {}),
});

function normEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** 신선도 기준시각(ms) — refreshed_at, 없으면 created_at. 못 읽으면 0(가장 오래된 취급). */
function basisMs(r: Record<string, unknown>): number {
  const basis = r.refreshed_at != null ? String(r.refreshed_at) : String(r.created_at ?? "");
  const t = Date.parse(basis);
  return Number.isFinite(t) ? t : 0;
}

/** 소유자 묶음 하나의 문구 — 숫자는 전부 실제 건수·경과일에서 나온다. */
function composeMessage(
  rows: StaleListingRow[],
): { title: string; body: string; refreshCount: number; closeCount: number } {
  const closes = rows.filter((r) => r.stage === 2);
  const refreshes = rows.filter((r) => r.stage === 1);
  const oldest = rows.reduce((a, b) => (a.ageDays >= b.ageDays ? a : b));

  /* 한 건뿐이면 단지 이름을 쓴다 — 어느 매물인지 바로 알 수 있는 편이 낫다. */
  if (rows.length === 1) {
    const one = rows[0];
    if (one.stage === 2) {
      return {
        title: "오래된 매물 정리할까요?",
        body: `「${one.complexName}」 매물이 ${one.ageDays}일째 그대로예요. 거래가 끝났다면 마감하고, 아직이면 끌어올려 주세요.`,
        refreshCount: 0,
        closeCount: 1,
      };
    }
    return {
      title: "매물 끌어올릴 시간이에요",
      body: `「${one.complexName}」 매물이 ${one.ageDays}일째 갱신되지 않았어요. 아직 거래 중이면 끌어올려 주세요.`,
      refreshCount: 1,
      closeCount: 0,
    };
  }

  const parts: string[] = [];
  if (refreshes.length > 0) {
    parts.push(`${refreshes.length}건은 ${LISTING_STALE_DAYS}일 넘게 갱신되지 않았고`);
  }
  if (closes.length > 0) {
    parts.push(`${closes.length}건은 ${LISTING_CLOSE_SUGGEST_DAYS}일이 지났어요`);
  }

  return {
    title:
      closes.length > 0 ? "오래된 매물 정리할까요?" : "매물 끌어올릴 시간이에요",
    body: `등록하신 매물 ${rows.length}건 중 ${parts.join(", ")}. 가장 오래된 건 ${oldest.ageDays}일째예요. 아직 거래 중이면 끌어올리고, 끝났으면 마감해 주세요.`,
    refreshCount: refreshes.length,
    closeCount: closes.length,
  };
}

/**
 * 알릴 대상 선별. 아무것도 보내지 않는다 — 조회와 계산만 한다.
 *
 * 조회 조건은 마이그레이션의 부분 인덱스(listings_stale_scan_idx)와 같은 모양이다:
 * status='approved' · is_hidden=false · deleted_at is null · stale_notice_stage < 2.
 */
export async function loadStaleListingOwners(
  limit = STALE_SCAN_LIMIT,
): Promise<StaleScan> {
  const sb = getServiceSupabase();
  if (!sb) return emptyScan("no-store");

  const cutoff = daysAgoIso(LISTING_STALE_DAYS);

  /* 신선도 기준은 coalesce(refreshed_at, created_at) 인데 PostgREST 로는 식을 필터할 수
     없다. or() 안에 and() 를 중첩하는 문법도 되기는 하지만, 값에 점(밀리초)이 들어가는
     타임스탬프를 그 파서에 태우는 건 여기서 실제로 확인할 방법이 없어서 쓰지 않았다.
     대신 refreshed_at 의 null 여부로 **겹치지 않게** 두 번 나눠 읽는다. 쿼리 한 번이
     늘어나는 대신 문법 위험이 0 이고, 각 갈래가 자기 컬럼으로 정렬된다. */
  const cols =
    "id, author_email, complex_name, region_name, created_at, refreshed_at, stale_notice_stage";
  const base = () =>
    sb
      .from("listings")
      .select(cols)
      .eq("status", "approved")
      .eq("is_hidden", false)
      .is("deleted_at", null)
      .lt("stale_notice_stage", 2);

  const [refreshedOnce, neverRefreshed] = await Promise.all([
    base()
      .not("refreshed_at", "is", null)
      .lt("refreshed_at", cutoff)
      .order("refreshed_at", { ascending: true })
      .limit(limit),
    base()
      .is("refreshed_at", null)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(limit),
  ]);

  const error = refreshedOnce.error ?? neverRefreshed.error;
  if (error) {
    logger.warn("[listing-stale] 매물 조회 실패", error.message);
    return emptyScan("listing-query-failed");
  }

  /* 두 갈래는 refreshed_at 의 null 여부로 갈려 있어 겹치지 않는다. 합치면 상한을
     넘을 수 있으므로 오래된 순으로 자른다. 잘린 매물은 다음 회차에 다시 뽑힌다. */
  const data = [
    ...((refreshedOnce.data ?? []) as Array<Record<string, unknown>>),
    ...((neverRefreshed.data ?? []) as Array<Record<string, unknown>>),
  ]
    .sort((a, b) => basisMs(a) - basisMs(b))
    .slice(0, limit);

  const now = Date.now();
  const staleRows: StaleListingRow[] = [];
  let alreadyNotified = 0;

  for (const raw of data) {
    const createdAt = String(raw.created_at ?? "");
    const refreshedAt = raw.refreshed_at != null ? String(raw.refreshed_at) : null;
    const stage = listingStaleStage({ createdAt, refreshedAt }, now);
    if (stage === 0) continue;

    const notifiedStage = Number(raw.stale_notice_stage ?? 0);
    const basisAt = refreshedAt ?? createdAt;
    const basisT = Date.parse(basisAt);
    const row: StaleListingRow = {
      id: String(raw.id ?? ""),
      authorEmail: normEmail(raw.author_email),
      complexName: String(raw.complex_name ?? "매물"),
      regionName: raw.region_name != null ? String(raw.region_name) : null,
      basisAt,
      ageDays: Number.isFinite(basisT)
        ? Math.max(0, Math.floor((now - basisT) / 86_400_000))
        : 0,
      stage,
      notifiedStage,
    };
    if (!row.id || !row.authorEmail) continue;

    /* 단계가 올라갔을 때만 새로 보낸다. 같은 단계면 이미 알린 것이다. */
    if (stage <= notifiedStage) {
      alreadyNotified += 1;
      continue;
    }
    staleRows.push(row);
  }

  const staleCount = staleRows.length + alreadyNotified;
  if (staleRows.length === 0) {
    return { ...emptyScan(), stale: staleCount, alreadyNotified };
  }

  /* 수신 설정 — 껐으면 통째로 제외. 조회가 실패하면 아무에게도 보내지 않는다:
     껐는지 모르는 채로 보내는 쪽이 한 번 덜 보내는 쪽보다 나쁘다. */
  const emails = Array.from(new Set(staleRows.map((r) => r.authorEmail)));
  const prefs = await sb
    .from("notification_preferences")
    .select("user_email, push_listing_stale")
    .in("user_email", emails);

  if (prefs.error) {
    logger.warn("[listing-stale] 알림 설정 조회 실패", prefs.error.message);
    return { ...emptyScan("prefs-query-failed"), stale: staleCount, alreadyNotified };
  }

  const optedOut = new Set(
    ((prefs.data ?? []) as Array<Record<string, unknown>>)
      .filter((r) => r.push_listing_stale === false)
      .map((r) => normEmail(r.user_email)),
  );

  const byOwner = new Map<string, StaleListingRow[]>();
  let optedOutListings = 0;
  for (const row of staleRows) {
    if (optedOut.has(row.authorEmail)) {
      optedOutListings += 1;
      continue;
    }
    const list = byOwner.get(row.authorEmail);
    if (list) list.push(row);
    else byOwner.set(row.authorEmail, [row]);
  }

  const owners: StaleOwnerGroup[] = [];
  for (const [userEmail, rows] of byOwner) {
    const msg = composeMessage(rows);
    owners.push({
      userEmail,
      title: msg.title,
      body: msg.body,
      actionUrl: "/my/listings",
      listings: rows,
      refreshCount: msg.refreshCount,
      closeCount: msg.closeCount,
    });
  }

  return {
    stale: staleCount,
    escalated: staleRows.length,
    alreadyNotified,
    optedOutOwners: emails.filter((e) => optedOut.has(e)).length,
    optedOutListings,
    owners,
  };
}
