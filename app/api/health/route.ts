import { NextResponse } from "next/server";

import { CSP_REVISION } from "@/lib/security/deploy-sync";

import {
  isDataGoKrEncodingConfigured,
  isOdcloudConfigured,
} from "@/lib/public-data/data-go-kr-keys";
import { getPublicDataProbeSummaryCached } from "@/lib/public-data/cached-probe";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { classifyIngestRun, type IngestOutcome } from "@/lib/market/ingest-outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ETL 성공이 이 시간보다 오래되면 degraded (일 배치 기준 여유 48h) */
const ETL_STALE_MS = 48 * 3600_000;

/** 소스별 마지막 실행이 실패·부분 실패인 것 — 소스명과 시각만, 메시지는 담지 않는다 */
type TroubledSource = { source: string; outcome: IngestOutcome; at: string };

type OpsChecks = {
  db: { ok: boolean };
  etl: {
    /**
     * 수집이 **살아 있는가** — 48h 안에 성공한 실행이 하나라도 있었는가.
     *
     * 부분 실패는 여기서 false 가 아니다. 이유는 이 값이 무엇을 켜는지에 있다:
     * synthetic.yml 은 `status != "ok"` 면 GitHub 이슈를 연다(하루 2회 실행).
     * 2,096행이 들어온 실행을 장애로 부르면 만성 키/쿼터 문제 하나로 이슈가
     * 매일 열리고, 그 다음부터는 아무도 안 본다 — 진짜 정지했을 때 구분이 안 된다.
     * 그래서 판정은 "전부 멎었는가" 에만 걸고, 부분 실패는 아래 필드로 드러낸다.
     */
    ok: boolean;
    lastSuccessAt: string | null;
    /** 성패를 가리지 않은 가장 최근 실행 — ok 만 보면 그 뒤의 실패가 안 보인다 */
    lastRunAt: string | null;
    lastRunOutcome: IngestOutcome;
    /** 마지막 실행이 실패·부분 실패로 끝난 소스들. 정상이면 빈 배열 */
    troubled: TroubledSource[];
  };
  env: { ok: boolean };
};

type RawLogRow = { source?: unknown; status?: unknown; rows?: unknown; created_at?: unknown };

/**
 * 운영 P0 체크 — DB ping(가벼운 단건 조회) · ETL 최근 성공 시각 · env 유효성.
 * [2026-08-09 정정] 예전 주석은 "etl_runs 테이블은 없어"라고 적었는데 틀렸다 —
 * public.etl_runs 는 존재한다(refresh_market_aggregates 가 기록, 실측 23행).
 * 다만 그건 시세 집계 갱신 로그이고, 이 헬스체크가 보는 것은 외부 수집 파이프라인
 * 로그(market_ingest_log)다. 표가 없어서가 아니라 용도가 달라서 이 표를 쓴다.
 * 민감정보(URL·키·에러 메시지)는 절대 반환하지 않는다 — boolean·시각·소스명만.
 *
 * ── #148 에서 고친 것 ────────────────────────────────────────────────────────
 * 원래는 `status='ok'` 인 마지막 행 하나만 읽었다. 그래서 그 뒤에 일어난 실패는
 * 헬스체크에 **전혀** 나타나지 않았다. 2026-07-25 프로덕션 실측:
 *
 *   02:58:11  geocode  status=ok                  ← 헬스체크가 본 유일한 행
 *   02:59:15  molit    status=error rows=2096     ← 시군구 16곳 중 13곳 실패
 *
 * 화면은 `etl.ok=true, lastSuccessAt=02:58:11` 로 초록이었다. 뒤에 일어난 사고를
 * 못 본 게 아니라, 볼 수 있는 자리가 없었다. 이제 마지막 실행과 소스별 문제를
 * 같이 싣는다 — synthetic.yml 이 `checks` 를 통째로 이슈 본문에 넣으므로,
 * 다른 이유로 알람이 울릴 때도 이 정보가 함께 나온다.
 */
async function getOpsChecks(): Promise<OpsChecks> {
  // env — supabase URL http(s) 검증 (값 자체는 노출하지 않음)
  let envOk = false;
  try {
    const url = getSupabaseUrl();
    if (url) {
      const parsed = new URL(url);
      envOk = parsed.protocol === "https:" || parsed.protocol === "http:";
    }
  } catch {
    envOk = false;
  }

  let dbOk = false;
  let etlOk = false;
  let lastSuccessAt: string | null = null;
  let lastRunAt: string | null = null;
  let lastRunOutcome: IngestOutcome = "none";
  let troubled: TroubledSource[] = [];
  try {
    const sb = getReadOnlySupabase();
    if (sb) {
      /* 로그를 한 번만 읽어 ping·최근 성공·소스별 최근 실행을 모두 여기서 뽑는다.
         200행이면 소스가 열 몇 개인 지금 구성에서 전 소스의 마지막 실행을 덮는다. */
      const { data, error } = await sb
        .from("market_ingest_log")
        .select("source, status, rows, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      dbOk = !error;

      if (dbOk && Array.isArray(data)) {
        const rows = data as RawLogRow[];
        const seen = new Set<string>();
        const now = Date.now();

        for (const r of rows) {
          const at = new Date(String(r.created_at ?? ""));
          if (Number.isNaN(at.getTime())) continue;
          const iso = at.toISOString();
          const status = String(r.status ?? "");
          const count = Number(r.rows ?? 0);
          const outcome = classifyIngestRun(status, Number.isFinite(count) ? count : 0);

          // 정렬이 내림차순이므로 처음 만나는 행이 그 소스의 마지막 실행이다
          if (lastRunAt === null) {
            lastRunAt = iso;
            lastRunOutcome = outcome;
          }
          /* noop(status=ok, 새 행 0건)도 성공으로 친다 — 파이프라인은 돌아서 정상
             종료했고, 그날 새 데이터가 없던 건 우리가 어쩔 수 있는 게 아니다.
             여기서 rows>0 을 요구하면 조용한 날에 헬스체크가 빨개진다. */
          if (lastSuccessAt === null && (outcome === "ok" || outcome === "noop")) {
            lastSuccessAt = iso;
            etlOk = now - at.getTime() < ETL_STALE_MS;
          }

          const source = String(r.source ?? "").trim();
          if (source && !seen.has(source)) {
            seen.add(source);
            /* skipped(대개 키 미설정)는 여기 넣지 않는다 — 시도조차 안 한 것이라
               "실행하다 잘못됐다" 와는 다른 얘기다. 그건 env 쪽 문제로 봐야 한다. */
            if (outcome === "partial" || outcome === "failed") {
              troubled.push({ source, outcome, at: iso });
            }
          }
        }
      }
    }
  } catch {
    dbOk = false;
    etlOk = false;
    lastSuccessAt = null;
    lastRunAt = null;
    lastRunOutcome = "none";
    troubled = [];
  }

  return {
    db: { ok: dbOk },
    etl: { ok: etlOk, lastSuccessAt, lastRunAt, lastRunOutcome, troubled },
    env: { ok: envOk },
  };
}



function check(key: string | undefined): boolean {

  return Boolean(key?.trim());

}



function hasValidHealthToken(req: Request, expectedToken: string | undefined): boolean {

  if (!expectedToken) return false;

  const authHeader = req.headers.get("authorization") ?? "";

  const url = new URL(req.url);

  const tokenParam = url.searchParams.get("token") ?? "";

  return authHeader === `Bearer ${expectedToken}` || tokenParam === expectedToken;

}



export async function GET(req: Request) {

  const isProduction = process.env.NODE_ENV === "production";

  const expectedToken = process.env.HEALTHCHECK_TOKEN?.trim();

  const hasValidToken = hasValidHealthToken(req, expectedToken);

  const url = new URL(req.url);

  const wantsDetail = url.searchParams.get("detail") === "1" || hasValidToken;



  const authSecret = check(process.env.AUTH_SECRET);

  const supabaseUrl = check(process.env.NEXT_PUBLIC_SUPABASE_URL);

  const supabaseAnon =

    check(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||

    check(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  const googleOAuth =

    check(process.env.AUTH_GOOGLE_ID) && check(process.env.AUTH_GOOGLE_SECRET);

  const naverOAuth =

    check(process.env.AUTH_NAVER_ID) && check(process.env.AUTH_NAVER_SECRET);

  const emergencyToken = check(process.env.EMERGENCY_ACCESS_TOKEN);

  const tossSecret = check(process.env.TOSS_SECRET_KEY);

  const tossClient = check(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);

  const seoulApi = check(process.env.SEOUL_DATA_API_KEY);
  const vworldApi = check(process.env.VWORLD_API_KEY);

  const molitEncoding = isDataGoKrEncodingConfigured();

  const odcloud = isOdcloudConfigured();



  const loginReady = authSecret && (supabaseAnon || googleOAuth || naverOAuth || emergencyToken);

  const criticalOk = authSecret && supabaseUrl;

  // 운영 P0: DB ping · ETL 최근 성공 · env 유효성 (인증 불필요, 민감정보 없음)
  const ops = await getOpsChecks();

  const opsOk = ops.db.ok && ops.etl.ok && ops.env.ok;

  const status = loginReady ? (criticalOk && opsOk ? "ok" : "degraded") : "no-login";



  // 공개 헬스체크 — UptimeRobot·Vercel 모니터링용 (민감 정보 없음)

  if (!wantsDetail) {

    return NextResponse.json(

      {

        status: loginReady && opsOk ? "ok" : "degraded",

        timestamp: new Date().toISOString(),

        deployId: process.env.VERCEL_DEPLOYMENT_ID?.trim() ?? null,

        cspRevision: CSP_REVISION,

        checks: {

          db: ops.db,

          etl: ops.etl,

          env: ops.env,

          loginReady,

          toss: tossSecret && tossClient,

          molitNationwide: molitEncoding,

          seoulApi,
          vworldApi,
          odcloud,

        },

        ...(expectedToken

          ? { hint: "Full diagnostics: Authorization Bearer HEALTHCHECK_TOKEN or ?detail=1&token=..." }

          : { hint: "Full diagnostics: ?detail=1" }),

      },

      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },

    );

  }



  // 운영 상세 진단은 토큰 필수 (민감 설정 노출 방지).
  //
  // 2026-08-02: `expectedToken &&` 조건이라 HEALTHCHECK_TOKEN 이 미설정이면
  // ?detail=1 만으로 전체 env 구성 유무(서비스롤·Stripe·Resend boolean)와
  // AUTH_URL 이 무인증 공개였다. 토큰이 없으면 상세를 아예 거부한다 —
  // "잠금 장치를 안 달았으니 다 보여준다"는 기본값이 거꾸로였다.

  if (isProduction && !expectedToken && wantsDetail) {
    return NextResponse.json(
      {
        status: "protected",
        timestamp: new Date().toISOString(),
        hint: "상세 진단은 HEALTHCHECK_TOKEN 설정 후 토큰 인증으로만 제공됩니다.",
      },
      { status: 401 },
    );
  }

  if (isProduction && expectedToken && !hasValidToken) {

    return NextResponse.json(

      {

        status: "protected",

        timestamp: new Date().toISOString(),

        hint: "Provide Authorization: Bearer HEALTHCHECK_TOKEN or ?detail=1&token=...",

      },

      { status: 401 },

    );

  }

  if (!isProduction && expectedToken && !hasValidToken) {

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  const authUrl = process.env.AUTH_URL?.trim() || null;

  const supabaseService = check(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const openai = check(process.env.OPENAI_API_KEY);

  const resend = check(process.env.RESEND_API_KEY);

  const stripe = check(process.env.STRIPE_SECRET_KEY);

  const vapid = check(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) && check(process.env.VAPID_PRIVATE_KEY);

  const naverMap = check(process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID);
  const naverMapRest =
    check(process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID) &&
    check(process.env.NAVER_MAP_CLIENT_SECRET);

  const exData = check(process.env.EX_DATA_API_KEY);

  const publicDataProbe = await getPublicDataProbeSummaryCached();

  const services = {

    auth: {

      secret: authSecret,

      url: authUrl,

      loginReady,

      providers: {

        supabasePassword: supabaseAnon && supabaseService,

        supabaseAuth: supabaseAnon,

        google: googleOAuth,

        naver: naverOAuth,

        emergencyToken,

      },

    },

    database: {

      supabaseUrl,

      supabaseAnon,

      supabaseService,

    },

    ai: { openai },

    email: { resend },

    payment: { stripe, toss: tossSecret, tossClient },

    push: { vapid },

    map: { naverMap, naverMapRest },

    publicData: {
      seoulApi,
      vworldApi,
      odcloud,

      molitNationwide: molitEncoding,

      exData,

    },

  };



  return NextResponse.json(

    {

      status,

      timestamp: new Date().toISOString(),

      checks: { db: ops.db, etl: ops.etl, env: ops.env },

      services,

      summary: {

        loginEnabled: loginReady,

        missingCritical: [

          !authSecret && "AUTH_SECRET",

          !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",

          !supabaseAnon && !googleOAuth && !naverOAuth && "OAuth or Supabase keys",

        ].filter(Boolean),

        publicDataProbe,

      },

    },

    {
      status: loginReady ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },

  );

}


