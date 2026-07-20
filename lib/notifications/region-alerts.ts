/**
 * 관심 지역/키워드 새 매물 알림 (#47 연계) — 승인된 매물이 등록되면
 * `user_watchlist` 의 알림 구독 행(alert: 접두)을 조회해 구독자 인박스로 알린다.
 *
 * 스키마 변경 없음 · best-effort(실패해도 상위 흐름에 영향 없음).
 *   - 지역 구독: complex_id = `alert:region:<region_name>` 및 region_name 안의 구/시/군 토큰.
 *   - 키워드 구독: complex_id like `alert:keyword:%` 중 키워드가 단지명/지역명에 포함될 때.
 * 작성자 본인은 제외하고, 이메일을 중복 제거해 최대 ~200명에게만 발송한다.
 */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { ALERT_PREFIX } from "@/lib/alerts/subscriptions";
import { logger } from "@/lib/log";

const MAX_RECIPIENTS = 200;
const KEYWORD_PREFIX = `${ALERT_PREFIX}keyword:`;

export interface NewListingForAlert {
  id: string;
  regionName?: string | null;
  complexName?: string | null;
  /** 알림에서 제외할 작성자 이메일 */
  authorEmail?: string | null;
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** region_name 에서 매칭 후보 집합 — 전체 값 + 포함된 구/시/군 토큰. */
function regionCandidates(regionName: string): string[] {
  const set = new Set<string>();
  const full = regionName.trim();
  if (full) set.add(full);
  const tokens = full.match(/[가-힣]+(?:구|시|군)/g);
  if (tokens) for (const t of tokens) set.add(t);
  return [...set];
}

/**
 * 승인된 매물에 대해 관심 지역/키워드 구독자에게 인박스 알림을 보낸다.
 * @returns 실제 발송한 인원 수(0 이상). 저장소 미설정/실패 시 0.
 */
export async function notifyNewListingSubscribers(
  listing: NewListingForAlert,
): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb) return 0;

  const id = String(listing.id ?? "").trim();
  if (!id) return 0;
  const regionName = String(listing.regionName ?? "").trim();
  const complexName = String(listing.complexName ?? "").trim();
  const authorEmail = listing.authorEmail ? normEmail(String(listing.authorEmail)) : null;

  const recipients = new Set<string>();

  try {
    // 1) 지역 구독자 — complex_id IN (alert:region:<후보>…)
    if (regionName) {
      const keys = regionCandidates(regionName).map((v) => `${ALERT_PREFIX}region:${v}`);
      if (keys.length > 0) {
        const { data } = await sb
          .from("user_watchlist")
          .select("user_email")
          .in("complex_id", keys)
          .limit(MAX_RECIPIENTS * 2);
        for (const r of (data ?? []) as Array<Record<string, unknown>>) {
          const e = normEmail(String(r.user_email ?? ""));
          if (e) recipients.add(e);
        }
      }
    }

    // 2) 키워드 구독자 — 키워드가 단지명/지역명에 포함될 때
    if (complexName || regionName) {
      const haystack = `${complexName} ${regionName}`;
      const { data } = await sb
        .from("user_watchlist")
        .select("user_email, complex_id")
        .like("complex_id", `${KEYWORD_PREFIX}%`)
        .limit(1000);
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        const key = String(r.complex_id ?? "");
        const kw = key.slice(KEYWORD_PREFIX.length).trim();
        if (kw && haystack.includes(kw)) {
          const e = normEmail(String(r.user_email ?? ""));
          if (e) recipients.add(e);
        }
      }
    }
  } catch (e) {
    logger.warn("[region-alerts] 구독자 조회 실패", e);
  }

  if (authorEmail) recipients.delete(authorEmail);

  const targets = [...recipients].slice(0, MAX_RECIPIENTS);
  if (targets.length === 0) return 0;

  const title = "관심 지역 새 매물";
  const body = `${regionName || "관심 지역"} '${complexName || "새 매물"}' 매물이 등록됐어요`;
  const actionUrl = `/listings/${id}`;

  let sent = 0;
  for (const email of targets) {
    try {
      await appendInboxNotification({ userEmail: email, title, body, actionUrl });
      sent += 1;
    } catch {
      // best-effort — 개별 발송 실패는 무시하고 계속 진행한다.
    }
  }
  return sent;
}
