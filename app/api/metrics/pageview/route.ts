import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 1st-party 페이지뷰/체류 수집 (어드민 트래픽 대시보드용).
 *
 * 개인정보 원칙:
 *  - 이메일·IP 를 저장하지 않는다(레이트리밋 키로만 IP 를 순간 사용).
 *  - session_key 는 브라우저 sessionStorage 의 무작위 값 — 탭 세션 단위이고
 *    사용자 계정과 연결되지 않는다.
 *  - 이 API 를 부르는 TrafficRecorder 자체가 분석 동의(analytics=true) 뒤에서만
 *    동작한다. 동의 없이 온 요청도 저장은 되지만(구분 불가), 클라이언트가
 *    보내지 않는 것이 1차 방어다.
 *
 * 이벤트 2종:
 *  - view : { t:"view", viewId, path, sessionKey } → 행 삽입
 *  - leave: { t:"leave", viewId, durationMs } → 해당 행 duration 갱신(1회성)
 */

type Body = {
  t?: string;
  viewId?: string;
  path?: string;
  sessionKey?: string;
  visitorKey?: string;
  durationMs?: number;
  /* 유입 출처 — 랜딩(세션 첫 뷰)에만 온다. referrerHost 는 호스트 문자열만
     허용(URL 금지 — 검색어 등 개인정보가 실릴 수 있다). */
  landing?: boolean;
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

const HOST_RE = /^[a-z0-9.-]{1,120}$/i;
/** UTM 값 정제 — 우리가 발행하는 값 형식만(영숫자·-_.) 80자 */
function cleanUtm(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 80);
  return /^[\w.-]{1,80}$/.test(s) ? s : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_RE = /^[a-f0-9]{16,64}$/i;

/**
 * 경로 → 집계 라우트 정규화. 동적 세그먼트를 패턴으로 접어 카디널리티 폭발을
 * 막는다. 모르는 경로는 1·2단계 세그먼트만 남긴다.
 */
function normalizeRoute(path: string): string {
  const p = path.split("?")[0].split("#")[0];
  const rules: [RegExp, string][] = [
    [/^\/complex\/browse/, "/complex/browse"],
    [/^\/complex\/compare/, "/complex/compare"],
    [/^\/complex\/[^/]+\/tx/, "/complex/[id]/tx"],
    [/^\/complex\/[^/]+/, "/complex/[id]"],
    [/^\/region\/[^/]+/, "/region/[id]"],
    [/^\/tx\/[^/]+\/(area|price)\/[^/]+/, "/tx/[region]/[band]"],
    [/^\/tx\/[^/]+/, "/tx/[region]"],
    [/^\/notes\/new/, "/notes/new"],
    [/^\/notes\/best/, "/notes/best"],
    [/^\/notes\/templates/, "/notes/templates"],
    [/^\/notes\/[^/]+\/deck/, "/notes/[id]/deck"],
    [/^\/notes\/[^/]+/, "/notes/[id]"],
    [/^\/town\/news\/[^/]+/, "/town/news/[id]"],
    [/^\/town\/groups\/[^/]+\/chat/, "/town/groups/[id]/chat"],
    [/^\/town\/groups\/[^/]+/, "/town/groups/[id]"],
    [/^\/listings\/[^/]+/, "/listings/[id]"],
    [/^\/reports\/season\/[^/]+/, "/reports/season/[slug]"],
    [/^\/reports\/[0-9]{6}/, "/reports/[ym]"],
    [/^\/analysis\/temperature\/[^/]+/, "/analysis/temperature/[region]"],
    [/^\/glossary\/[^/]+/, "/glossary/[term]"],
    [/^\/qna\/[^/]+/, "/qna/[id]"],
    [/^\/invite\/[^/]+/, "/invite/[code]"],
    [/^\/digest\/[^/]+/, "/digest/[week]"],
  ];
  for (const [re, route] of rules) if (re.test(p)) return route;
  const segs = p.split("/").filter(Boolean);
  if (segs.length <= 2) return `/${segs.join("/")}` || "/";
  return `/${segs[0]}/${segs[1]}/*`;
}

export async function POST(req: NextRequest): Promise<Response> {
  /* 무인증 텔레메트리 — 페이지 이동당 2요청. 도배만 막는다. */
  const rl = rateLimit(`pageview:${getClientIp(req)}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const viewId = String(body.viewId ?? "");
  if (!UUID_RE.test(viewId)) return NextResponse.json({ ok: false }, { status: 400 });

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, stored: false });

  if (body.t === "view") {
    const rawPath = String(body.path ?? "");
    const sessionKey = String(body.sessionKey ?? "");
    if (!rawPath.startsWith("/") || rawPath.length > 300 || !SESSION_RE.test(sessionKey)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const path = rawPath.split("?")[0].slice(0, 300);
    const isLanding = body.landing === true;
    /* 웹30 — 방문자 키(localStorage 무작위 값). 형식이 어긋나면 버린다 —
       세션 키와 달리 없어도 view 는 기록한다(재방문 지표만 표본에서 빠진다). */
    const visitorKey =
      typeof body.visitorKey === "string" && SESSION_RE.test(body.visitorKey)
        ? body.visitorKey.toLowerCase()
        : null;
    const referrerHost =
      isLanding && typeof body.referrerHost === "string" && HOST_RE.test(body.referrerHost.trim())
        ? body.referrerHost.trim().toLowerCase()
        : null;
    const { error } = await sb.from("page_view_events").insert({
      view_id: viewId,
      route: normalizeRoute(path),
      path,
      session_key: sessionKey.toLowerCase(),
      visitor_key: visitorKey,
      is_landing: isLanding,
      referrer_host: referrerHost,
      utm_source: isLanding ? cleanUtm(body.utmSource) : null,
      utm_medium: isLanding ? cleanUtm(body.utmMedium) : null,
      utm_campaign: isLanding ? cleanUtm(body.utmCampaign) : null,
    });
    // unique(view_id) 충돌 = 중복 비콘 — 정상 무시
    if (error && !String(error.code) .startsWith("23")) {
      logger.warn("[pageview] insert 실패", error.message);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.t === "leave") {
    const duration = Math.round(Number(body.durationMs));
    if (!Number.isFinite(duration) || duration < 0) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    // 1시간 상한 — 밤새 열린 탭이 평균 체류를 왜곡하지 않게
    const capped = Math.min(duration, 3_600_000);
    /* duration 이 이미 있으면 덮지 않는다(첫 leave 가 확정값) */
    const { error } = await sb
      .from("page_view_events")
      .update({ duration_ms: capped })
      .eq("view_id", viewId)
      .is("duration_ms", null);
    if (error) {
      logger.warn("[pageview] duration 갱신 실패", error.message);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
