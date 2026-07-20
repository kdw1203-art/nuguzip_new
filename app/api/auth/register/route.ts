import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";
import { getServiceSupabase } from "@/lib/supabase/service";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";

export const runtime = "nodejs";

/**
 * 본인 이메일 확인(인증 메일) 강제 여부.
 * 기본값 ON. 끄려면 REQUIRE_EMAIL_CONFIRMATION=0|false|off.
 * 켜져 있고 Supabase 공개 키가 있으면 Supabase Auth 가입(인증 메일) 경로를 우선 사용합니다.
 */
function emailConfirmationEnabled(): boolean {
  const v = process.env.REQUIRE_EMAIL_CONFIRMATION?.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}

/** 인증 메일의 확인 링크가 돌아올 정식 도메인. 운영은 항상 canonical, 그 외엔 요청 호스트. */
function canonicalOrigin(req: NextRequest): string {
  if (process.env.VERCEL_ENV === "production") return DEFAULT_DESKTOP_ORIGIN;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  if (host) return `${proto}://${host}`;
  return DEFAULT_DESKTOP_ORIGIN;
}

function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

function isMissingColumnCode(code: string | undefined): boolean {
  // Postgres undefined_column
  return code === "42703";
}

function isMissingAppUsersTable(
  code: string | undefined,
  message: string | undefined,
): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    m.includes("public.app_users") ||
    m.includes("schema cache")
  );
}

function shouldFallbackToSupabaseAuth(
  code: string | undefined,
  message: string | undefined,
): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    isMissingAppUsersTable(code, message) ||
    isMissingColumnCode(code) ||
    isMissingColumnError(message) ||
    code === "42501" ||
    m.includes("permission denied") ||
    m.includes("rls") ||
    m.includes("violates row-level security policy")
  );
}

async function signUpWithSupabaseAuth(
  supabaseUrl: string,
  supabasePublicKey: string,
  email: string,
  password: string,
  name: string,
  source: string,
  campaign: string,
  emailRedirectTo?: string,
  identity?: { verified: boolean; provider?: string },
) {
  const authClient = createClient(supabaseUrl, supabasePublicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        source,
        campaign,
        ...(identity?.verified
          ? {
              identity_verified: true,
              identity_provider: identity.provider ?? null,
            }
          : {}),
      },
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });
  if (error) {
    // 네트워크 단절·게이트웨이 오류 등 업스트림(Supabase Auth) 장애는
    // 클라이언트 잘못(400)이 아니라 일시적 사용 불가(503)로 구분한다.
    const status = (error as { status?: number }).status;
    const upstreamUnavailable =
      status === undefined || status === 0 || status >= 500;
    if (upstreamUnavailable) {
      return NextResponse.json(
        { error: "일시적으로 가입 처리를 할 수 없습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "가입 처리 중 오류가 발생했습니다.", detail: error.message },
      { status: 400 },
    );
  }
  const emailConfirmationRequired = !data.session;
  return NextResponse.json(
    {
      user: {
        id: data.user?.id ?? email,
        email: data.user?.email ?? email,
        name,
      },
      emailConfirmationRequired,
    },
    { status: 201 },
  );
}

type Consent = {
  terms: boolean;
  privacy: boolean;
  age: boolean;
  marketing: boolean;
  location: boolean;
};

/** 동의 기록을 별도 저장(법적 증빙). 서비스 키가 없으면 조용히 건너뜁니다. */
async function recordConsent(
  sb: ReturnType<typeof getServiceSupabase>,
  email: string,
  consent: Consent,
  ip: string | null,
  ua: string | null,
) {
  if (!sb) return;
  try {
    await sb.from("user_consents").upsert(
      {
        user_email: email,
        terms_agreed: consent.terms,
        privacy_agreed: consent.privacy,
        age_confirmed: consent.age,
        marketing_agreed: consent.marketing,
        location_agreed: consent.location,
        terms_version: "2025-06-01",
        privacy_version: "2025-06-01",
        ip_address: ip,
        user_agent: ua,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_email" },
    );
  } catch {
    // 동의 기록 실패해도 가입은 진행
  }
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const sb = getServiceSupabase();
  const supabaseUrl = getSupabaseUrl();
  const supabasePublicKey = getSupabasePublicKey();
  if (!sb && (!supabaseUrl || !supabasePublicKey)) {
    return NextResponse.json(
      { error: "Supabase가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const email = String(b.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(b.password ?? "");
  const name = String(b.name ?? "").trim() || email.split("@")[0] || "회원";
  const source = String(b.source ?? "auth_signup").trim().slice(0, 80) || "auth_signup";
  const campaign = String(b.campaign ?? "default").trim().slice(0, 80) || "default";

  const consentRaw = (b.consent ?? {}) as Record<string, unknown>;
  const consent = {
    terms: Boolean(consentRaw.terms),
    privacy: Boolean(consentRaw.privacy),
    age: Boolean(consentRaw.age),
    marketing: Boolean(consentRaw.marketing),
    location: Boolean(consentRaw.location),
  };

  const identity = {
    verified: Boolean(b.identityVerified),
    provider:
      typeof b.identityProvider === "string"
        ? b.identityProvider.trim().slice(0, 40)
        : undefined,
  };

  if (!email.includes("@")) {
    return NextResponse.json({ error: "올바른 이메일을 입력해 주세요." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "비밀번호는 8자 이상이어야 합니다." },
      { status: 400 },
    );
  }
  if (!consent.terms || !consent.privacy || !consent.age) {
    return NextResponse.json(
      { error: "필수 약관(이용약관·개인정보처리방침·만 14세 이상)에 동의해 주세요." },
      { status: 400 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const ua = req.headers.get("user-agent") ?? null;

  // 본인 이메일 확인을 강제(기본 ON)하고 공개 키가 있으면
  // Supabase Auth 가입(인증 메일 발송) 경로를 우선 사용합니다.
  if (emailConfirmationEnabled() && supabaseUrl && supabasePublicKey) {
    await recordConsent(sb, email, consent, ip, ua);
    const verifyRedirect = `${canonicalOrigin(req)}/auth/login?verified=1&email=${encodeURIComponent(email)}`;
    return signUpWithSupabaseAuth(
      supabaseUrl,
      supabasePublicKey,
      email,
      password,
      name,
      source,
      campaign,
      verifyRedirect,
      identity,
    );
  }

  // Service Role이 없는 배포에서도 Supabase Auth 회원가입은 허용
  if (!sb && supabaseUrl && supabasePublicKey) {
    await recordConsent(sb, email, consent, ip, ua);
    return signUpWithSupabaseAuth(
      supabaseUrl,
      supabasePublicKey,
      email,
      password,
      name,
      source,
      campaign,
      undefined,
      identity,
    );
  }

  const password_hash = await bcrypt.hash(password, 12);

  const withExtendedColumns = {
    email,
    password_hash,
    name,
    role: "user",
    plan: "free",
    marketing_agreed: consent.marketing,
    location_agreed: consent.location,
    consent_updated_at: new Date().toISOString(),
    signup_source: source,
    signup_campaign: campaign,
    ...(identity.verified
      ? {
          identity_verified: true,
          identity_verified_at: new Date().toISOString(),
          identity_provider: identity.provider ?? null,
        }
      : {}),
  };

  const { data, error } = await sb!
    .from("app_users")
    .insert(withExtendedColumns)
    .select("id, email, name")
    .single();

  let finalData = data;
  let finalError = error;

  // 운영 DB 마이그레이션이 덜 반영된 경우(추가 컬럼 미존재) 기본 컬럼만으로 재시도
  if (
    finalError &&
    (isMissingColumnCode(finalError.code) ||
      isMissingColumnError(finalError.message))
  ) {
    const fallback = await sb!
      .from("app_users")
      .insert({
        email,
        password_hash,
        name,
        role: "user",
      })
      .select("id, email, name")
      .single();
    finalData = fallback.data;
    finalError = fallback.error;
  }

  if (finalError) {
    if (supabaseUrl && supabasePublicKey && shouldFallbackToSupabaseAuth(finalError.code, finalError.message)) {
      // 운영 DB 스키마/권한 편차가 있으면 Supabase Auth 기본 경로로 자동 우회
      await recordConsent(sb, email, consent, ip, ua);
      const verifyRedirect = emailConfirmationEnabled()
        ? `${canonicalOrigin(req)}/auth/login?verified=1&email=${encodeURIComponent(email)}`
        : undefined;
      return signUpWithSupabaseAuth(
        supabaseUrl,
        supabasePublicKey,
        email,
        password,
        name,
        source,
        campaign,
        verifyRedirect,
        identity,
      );
    }
    const duplicated =
      finalError.code === "23505" ||
      /duplicate|already exists|unique/i.test(finalError.message ?? "");
    if (duplicated) {
      return NextResponse.json(
        { error: "이미 가입된 이메일입니다." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: "가입 처리 중 오류가 발생했습니다.",
        detail: finalError.message,
      },
      { status: 500 },
    );
  }

  // 동의 기록 별도 저장 (법적 증빙)
  await recordConsent(sb, email, consent, ip, ua);

  return NextResponse.json(
    {
      user: { id: finalData!.id, email: finalData!.email, name: finalData!.name },
      emailConfirmationRequired: false,
    },
    { status: 201 },
  );
}
