import { NextResponse } from "next/server";

import { CSP_REVISION } from "@/lib/security/deploy-sync";

import {
  isDataGoKrEncodingConfigured,
  isOdcloudConfigured,
} from "@/lib/public-data/data-go-kr-keys";
import { getPublicDataProbeSummaryCached } from "@/lib/public-data/cached-probe";



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

  const status = loginReady ? (criticalOk ? "ok" : "degraded") : "no-login";



  // 공개 헬스체크 — UptimeRobot·Vercel 모니터링용 (민감 정보 없음)

  if (!wantsDetail) {

    return NextResponse.json(

      {

        status: loginReady ? "ok" : "degraded",

        timestamp: new Date().toISOString(),

        deployId: process.env.VERCEL_DEPLOYMENT_ID?.trim() ?? null,

        cspRevision: CSP_REVISION,

        checks: {

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

      { status: 200 },

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

    { status: loginReady ? 200 : 503 },

  );

}


