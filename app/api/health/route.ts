import { NextResponse } from "next/server";

import { CSP_REVISION } from "@/lib/security/deploy-sync";

import {
  isDataGoKrEncodingConfigured,
  isOdcloudConfigured,
} from "@/lib/public-data/data-go-kr-keys";
import { getPublicDataProbeSummaryCached } from "@/lib/public-data/cached-probe";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getSupabaseUrl } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ETL 성공이 이 시간보다 오래되면 degraded (일 배치 기준 여유 48h) */
const ETL_STALE_MS = 48 * 3600_000;

type OpsChecks = {
  db: { ok: boolean };
  etl: { ok: boolean; lastSuccessAt: string | null };
  env: { ok: boolean };
};

/**
 * 운영 P0 체크 — DB ping(가벼운 단건 조회) · ETL 최근 성공 시각 · env 유효성.
 * 코드베이스에 etl_runs 테이블은 없어 실제 수집 로그 테이블(market_ingest_log)을 사용.
 * 민감정보(URL·키·에러 메시지)는 절대 반환하지 않는다 — boolean과 시각만.
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
  try {
    const sb = getReadOnlySupabase();
    if (sb) {
      // db ping — 단건 조회 (가벼운 select 1 상당)
      const { error } = await sb
        .from("market_ingest_log")
        .select("created_at")
        .limit(1);
      dbOk = !error;

      // etl — 최근 성공(status=ok) 시각
      if (dbOk) {
        const { data, error: etlError } = await sb
          .from("market_ingest_log")
          .select("created_at")
          .eq("status", "ok")
          .order("created_at", { ascending: false })
          .limit(1);
        if (!etlError && data && data.length > 0) {
          const at = new Date(String(data[0].created_at));
          if (!Number.isNaN(at.getTime())) {
            lastSuccessAt = at.toISOString();
            etlOk = Date.now() - at.getTime() < ETL_STALE_MS;
          }
        }
      }
    }
  } catch {
    dbOk = false;
    etlOk = false;
  }

  return { db: { ok: dbOk }, etl: { ok: etlOk, lastSuccessAt }, env: { ok: envOk } };
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



  // 운영 상세 진단은 토큰 필수 (민감 설정 노출 방지)

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


