import "server-only";
import { getKakaoRestApiKey } from "@/lib/kakao/rest-client";
import {
  getKakaoRolloutPhases,
  isKakaoShareConfigured,
} from "@/lib/kakao/oauth-config";
import {
  isSupabaseAuthConfigured,
  isSupabaseConfigured,
} from "@/lib/supabase/flags";

/** UI 그룹: 필수는 KPI·DB, 나머지는 서비스별 선택. */
export type IntegrationTier =
  | "critical"
  | "session"
  | "payments"
  | "oauth"
  | "extra";

export const INTEGRATION_TIER_LABEL: Record<IntegrationTier, string> = {
  critical: "DB 집계(필수)",
  session: "로그인·세션",
  payments: "결제",
  oauth: "소셜 로그인",
  extra: "기능 확장(선택)",
};

export type PlatformIntegrationRow = {
  id: string;
  tier: IntegrationTier;
  label: string;
  description: string;
  ok: boolean;
  envKeys: string;
  docsUrl?: string;
};

/**
 * 관리자 화면용: 외부 서비스·환경변수 연결 여부(값 존재만 검사, 유효성 검증은 아님).
 * 서버에서만 호출하세요.
 */
export function getPlatformIntegrationRows(): PlatformIntegrationRow[] {
  const google =
    Boolean(process.env.AUTH_GOOGLE_ID?.trim()) &&
    Boolean(process.env.AUTH_GOOGLE_SECRET?.trim());
  const github =
    Boolean(process.env.GITHUB_TOKEN?.trim()) ||
    Boolean(process.env.GH_TOKEN?.trim());
  const toss =
    Boolean(process.env.TOSS_SECRET_KEY?.trim()) &&
    Boolean(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim());
  const tossTest = Boolean(
    process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim().startsWith("test_"),
  );

  return [
    {
      id: "supabase-service",
      tier: "critical",
      label: "Supabase (Service Role)",
      description: "관리자 KPI·회원·게시글·신고·Web Vitals 등 DB 집계",
      ok: isSupabaseConfigured(),
      envKeys: "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
      docsUrl: "https://supabase.com/docs/guides/api",
    },
    {
      id: "supabase-client",
      tier: "session",
      label: "Supabase (클라이언트 키)",
      description: "브라우저 세션·비밀번호 로그인 경로",
      ok: isSupabaseAuthConfigured(),
      envKeys:
        "NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY 또는 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      docsUrl: "https://supabase.com/docs/guides/api/creating-routes",
    },
    {
      id: "nextauth",
      tier: "session",
      label: "NextAuth (AUTH_SECRET)",
      description: "세션·OAuth 콜백 보안. 프로덕션에서 필수",
      ok:
        Boolean(process.env.AUTH_SECRET?.trim()) ||
        process.env.NODE_ENV !== "production",
      envKeys: "AUTH_SECRET (+ AUTH_URL)",
      docsUrl: "https://authjs.dev/getting-started/deployment",
    },
    {
      id: "stripe",
      tier: "payments",
      label: "Stripe (구독 청구)",
      description: "PRO/EXPERT Stripe Checkout·Webhook",
      ok: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
      envKeys: "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_*",
      docsUrl: "https://stripe.com/docs",
    },
    {
      id: "toss",
      tier: "payments",
      label: "Toss Payments",
      /* 환경 가이드(docs.tosspayments.com/guides/environment) 요지:
         test_ 키 승인은 가상(실청구 없음), 키는 test/live 짝을 맞춰야 하며
         카카오페이 간편결제는 토스 테스트 환경 미지원(라이브 키 필요). */
      description: tossTest
        ? "원화 결제(테스트 키 — 승인은 가상, 실제 청구 없음)"
        : "원화 결제·payments 테이블 연동 (카드+간편결제 통합결제창)",
      ok: toss,
      envKeys: "TOSS_SECRET_KEY + NEXT_PUBLIC_TOSS_CLIENT_KEY (test/live 짝 일치)",
      docsUrl: "https://docs.tosspayments.com/guides/environment",
    },
    {
      id: "openai",
      tier: "extra",
      label: "OpenAI",
      description: "AI 분석·챗 등 `/api/ai/*` 경로",
      ok: Boolean(process.env.OPENAI_API_KEY?.trim()),
      envKeys: "OPENAI_API_KEY",
      docsUrl: "https://platform.openai.com/docs",
    },
    {
      id: "google-oauth",
      tier: "oauth",
      label: "Google 로그인",
      description:
        "NextAuth OAuth 2.0 · Console 리디렉션 URI에 `https://nuguzip.com/api/auth/callback/google` 필수 (mismatch 시 docs/ops/google-oauth-redirect.md)",
      ok: google,
      envKeys: "AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET (+ AUTH_URL)",
      docsUrl: "https://console.cloud.google.com/apis/credentials",
    },
    {
      id: "kakao-share",
      tier: "extra",
      label: "카카오톡 공유 (JS SDK)",
      description: "마이·초대 링크 카카오톡 공유 (로그인 연동 아님)",
      ok: isKakaoShareConfigured(),
      envKeys: "NEXT_PUBLIC_KAKAO_JS_KEY",
      docsUrl: "https://developers.kakao.com/docs/latest/ko/kakaotalk-share/js-link",
    },
    {
      id: "kakaopay",
      tier: "payments",
      label: "카카오페이 (단건)",
      description: "POST /api/payments/kakaopay/ready",
      ok: Boolean(
        process.env.KAKAOPAY_CID?.trim() &&
          process.env.KAKAOPAY_SECRET_KEY?.trim(),
      ),
      envKeys: "KAKAOPAY_CID + KAKAOPAY_SECRET_KEY",
      docsUrl: "https://developers.kakao.com/docs/latest/ko/kakaopay/common",
    },
    {
      id: "naver-map",
      tier: "extra",
      label: "네이버 지도",
      description: "지도 탐색·시세 지도 (`/map/*`)",
      ok:
        Boolean(process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim()) &&
        Boolean(process.env.NAVER_MAP_CLIENT_SECRET?.trim()),
      envKeys:
        "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID + NAVER_MAP_CLIENT_SECRET + NEXT_PUBLIC_NAVER_MAP_STYLE_ID(optional)",
      docsUrl: "https://console.ncloud.com/",
    },
    {
      id: "data-go-kr",
      tier: "extra",
      label: "공공데이터포털 (odcloud)",
      description: "청약홈 경쟁률·전국 OpenAPI (`/api/applyhome/*`)",
      ok: Boolean(process.env.DATA_GO_KR_SERVICE_KEY?.trim()),
      envKeys: "DATA_GO_KR_SERVICE_KEY",
      docsUrl: "https://www.data.go.kr/",
    },
    {
      id: "seoul-openapi",
      tier: "extra",
      label: "서울 열린데이터광장",
      description: "서울 실거래·중개업 fallback (`/api/public-data/*`)",
      ok: Boolean(process.env.SEOUL_DATA_API_KEY?.trim()),
      envKeys: "SEOUL_DATA_API_KEY",
      docsUrl: "http://data.seoul.go.kr",
    },
    {
      id: "vworld",
      tier: "extra",
      label: "브이월드 (국토부 중개업)",
      description: "전국 부동산중개업 WFS (`/api/public-data/brokers`)",
      ok: Boolean(process.env.VWORLD_API_KEY?.trim()),
      envKeys: "VWORLD_API_KEY + VWORLD_API_DOMAIN",
      docsUrl: "https://www.vworld.kr",
    },
    {
      id: "ncp-sens",
      tier: "extra",
      label: "NCP SMS (SENS)",
      description: "관리자 SMS/LMS 발송 (`/admin/sms`)",
      ok: Boolean(
        process.env.NCP_ACCESS_KEY?.trim() &&
          process.env.NCP_SECRET_KEY?.trim() &&
          process.env.NCP_SENS_SERVICE_ID?.trim() &&
          process.env.NCP_SENS_FROM_NUMBER?.trim(),
      ),
      envKeys:
        "NCP_ACCESS_KEY + NCP_SECRET_KEY + NCP_SENS_SERVICE_ID + NCP_SENS_FROM_NUMBER",
      docsUrl: "https://api.ncloud-docs.com/docs/sens-sms-send",
    },
    {
      id: "kakao-local",
      tier: "extra",
      label: "Kakao Local API",
      description: "주변 중개·법무·세무 업체 (`/api/kakao/local/nearby`)",
      ok: Boolean(getKakaoRestApiKey()),
      envKeys: "KAKAO_REST_API_KEY",
      docsUrl: "https://developers.kakao.com/docs/latest/ko/local/dev-guide",
    },
    {
      id: "github",
      tier: "extra",
      label: "GitHub API",
      description: "릴리스·이슈 자동화 등(선택). 토큰만 있으면 연결됨으로 표시",
      ok: github,
      envKeys: "GITHUB_TOKEN 또는 GH_TOKEN",
      docsUrl: "https://docs.github.com/en/rest",
    },
  ];
}

export const INTEGRATION_TIER_ORDER: IntegrationTier[] = [
  "critical",
  "session",
  "payments",
  "oauth",
  "extra",
];

export function integrationTierCounts(rows: PlatformIntegrationRow[]): Record<
  IntegrationTier,
  { ok: number; total: number }
> {
  const out = {} as Record<IntegrationTier, { ok: number; total: number }>;
  for (const t of INTEGRATION_TIER_ORDER) out[t] = { ok: 0, total: 0 };
  for (const r of rows) {
    out[r.tier].total += 1;
    if (r.ok) out[r.tier].ok += 1;
  }
  return out;
}

export { getKakaoRolloutPhases };
