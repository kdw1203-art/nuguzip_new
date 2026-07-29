import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";
import { getServiceSupabase } from "@/lib/supabase/service";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";
import {
  isMissingColumnError,
  isMissingTableError,
  isTransientSchemaCacheError,
  type PgErrorLike,
} from "@/lib/supabase/pg-error";

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

function isMissingColumn(err: PgErrorLike): boolean {
  return isMissingColumnError(err);
}

function isMissingAppUsersTable(err: PgErrorLike): boolean {
  if (isMissingTableError(err)) return true;
  return (err.message ?? "").toLowerCase().includes("public.app_users");
}

/**
 * app_users 경로를 포기하고 Supabase Auth 로 우회할 것인가.
 *
 * **일시적 장애는 여기에 들어오면 안 된다.** 예전 판정은 메시지에 "schema cache"
 * 가 있으면 곧장 우회했는데, 프로덕션에서 가장 흔한 오류인 PGRST002
 * ("Could not query the database for the schema cache. Retrying.") 가 정확히 그
 * 문자열을 달고 온다. 그 결과 DB 가 몇 초 밀린 사이에 가입한 사람만 app_users 가
 * 아니라 Supabase Auth 쪽에 만들어져, 계정 저장소가 조용히 갈라진다.
 *
 * 우회는 **구조적 편차**(테이블·컬럼이 없다, 권한이 막혔다)일 때만 하는 판단이다.
 * 일시적인 밀림이면 우회 대신 "지금은 못 받는다"고 답해야 한다(503).
 */
function shouldFallbackToSupabaseAuth(err: PgErrorLike): boolean {
  if (isTransientSchemaCacheError(err)) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    isMissingAppUsersTable(err) ||
    isMissingColumn(err) ||
    err.code === "42501" ||
    m.includes("permission denied") ||
    m.includes("rls") ||
    m.includes("violates row-level security policy")
  );
}

function isAlreadyRegisteredError(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("user already exists") ||
    m.includes("email address has already been registered")
  );
}

/** Auth Admin 으로 이메일 사용자 조회 (페이지네이션, 상한 5페이지). */
async function findAuthUserByEmail(email: string) {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * 미인증 계정에 다시 가입을 시도한 경우:
 * 1) 방금 입력한 비밀번호로 갱신 (다음에 로그인할 수 있게)
 * 2) 인증 메일 재발송
 */
async function recoverUnconfirmedSignup(opts: {
  supabaseUrl: string;
  supabasePublicKey: string;
  email: string;
  password: string;
  name: string;
  emailRedirectTo?: string;
}): Promise<NextResponse | null> {
  const existing = await findAuthUserByEmail(opts.email);
  if (!existing) return null;

  if (existing.email_confirmed_at) {
    return NextResponse.json(
      {
        error: "이미 가입된 이메일입니다. 로그인해 주세요.",
        code: "already_registered",
      },
      { status: 409 },
    );
  }

  const sb = getServiceSupabase();
  let passwordUpdated = false;
  if (sb) {
    const { error: updErr } = await sb.auth.admin.updateUserById(existing.id, {
      password: opts.password,
      email: opts.email,
      user_metadata: {
        ...(existing.user_metadata ?? {}),
        name: opts.name,
      },
    });
    if (updErr) {
      return NextResponse.json(
        {
          error: "기존 미인증 계정을 갱신하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          detail: updErr.message,
        },
        { status: 500 },
      );
    }
    passwordUpdated = true;
  }

  const authClient = createClient(opts.supabaseUrl, opts.supabasePublicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: resendErr } = await authClient.auth.resend({
    type: "signup",
    email: opts.email,
    options: opts.emailRedirectTo
      ? { emailRedirectTo: opts.emailRedirectTo }
      : undefined,
  });
  if (resendErr) {
    /* 재발송 한도 등 — 비밀번호는 이미 갱신됐을 수 있으므로 안내만 */
    return NextResponse.json(
      {
        user: { id: existing.id, email: opts.email, name: opts.name },
        emailConfirmationRequired: true,
        resent: false,
        message: passwordUpdated
          ? "비밀번호는 갱신했습니다. 인증 메일 재발송에 실패했다면 잠시 후 ‘인증 메일 다시 보내기’를 눌러 주세요."
          : "인증 메일 재발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        detail: resendErr.message,
      },
      { status: 201 },
    );
  }

  try {
    const { ensureAppUserRow } = await import("@/lib/auth/ensure-app-user");
    await ensureAppUserRow({
      email: opts.email,
      name: opts.name,
      authUserId: existing.id,
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json(
    {
      user: { id: existing.id, email: opts.email, name: opts.name },
      emailConfirmationRequired: true,
      resent: true,
      message: "인증 메일을 다시 보냈습니다. 메일함의 새 링크를 확인해 주세요.",
    },
    { status: 201 },
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
  /** true 면 신규 signUp 없이 미인증 재발송만 시도 */
  resendOnly?: boolean,
) {
  if (resendOnly) {
    const recovered = await recoverUnconfirmedSignup({
      supabaseUrl,
      supabasePublicKey,
      email,
      password,
      name,
      emailRedirectTo,
    });
    if (recovered) return recovered;
    return NextResponse.json(
      { error: "재발송할 미인증 계정을 찾지 못했습니다. 처음부터 다시 가입해 주세요." },
      { status: 404 },
    );
  }

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

  /* 이미 가입된 이메일 / 미인증 재시도 → 복구 경로 */
  if (error && isAlreadyRegisteredError(error.message)) {
    const recovered = await recoverUnconfirmedSignup({
      supabaseUrl,
      supabasePublicKey,
      email,
      password,
      name,
      emailRedirectTo,
    });
    if (recovered) return recovered;
    return NextResponse.json(
      {
        error: "이미 가입된 이메일입니다. 로그인해 주세요.",
        code: "already_registered",
      },
      { status: 409 },
    );
  }

  /*
   * Supabase 는 미인증 기존 계정에 대해 오류 대신 user 를 돌려주며
   * identities 가 비어 있는 경우가 있다. 이 때도 재발송·비밀번호 갱신으로 이어간다.
   */
  const identities = data.user?.identities;
  if (!error && data.user && Array.isArray(identities) && identities.length === 0) {
    const recovered = await recoverUnconfirmedSignup({
      supabaseUrl,
      supabasePublicKey,
      email,
      password,
      name,
      emailRedirectTo,
    });
    if (recovered) return recovered;
  }

  if (!error && data.user?.email) {
    try {
      const { ensureAppUserRow } = await import("@/lib/auth/ensure-app-user");
      await ensureAppUserRow({
        email: data.user.email,
        name,
        authUserId: data.user.id,
      });
    } catch {
      /* best-effort */
    }
  }
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
  // IP당 10분에 5회 (인스턴스별 best-effort)
  const rl = rateLimit(`register:${getClientIp(req)}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

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
  const resendOnly = Boolean(b.resendConfirmation);

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
  if (!resendOnly && (!consent.terms || !consent.privacy || !consent.age)) {
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
    if (!resendOnly) await recordConsent(sb, email, consent, ip, ua);
    /* /auth/confirm 은 PKCE·token_hash·해시 토큰을 모두 처리한다.
       Site URL 이 옛 my-project 호스트여도 브릿지가 여기로 모은다. */
    const verifyRedirect = `${canonicalOrigin(req)}/auth/confirm?next=${encodeURIComponent(`/login?verified=1&email=${encodeURIComponent(email)}`)}`;
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
      resendOnly,
    );
  }

  // Service Role이 없는 배포에서도 Supabase Auth 회원가입은 허용
  if (!sb && supabaseUrl && supabasePublicKey) {
    await recordConsent(sb, email, consent, ip, ua);
    const verifyRedirect = emailConfirmationEnabled()
      ? `${canonicalOrigin(req)}/auth/confirm?next=${encodeURIComponent(`/login?verified=1&email=${encodeURIComponent(email)}`)}`
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
  if (finalError && isMissingColumn(finalError)) {
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
    /* DB 가 지금 밀리는 것뿐이라면 우회하지 않는다 — 우회하면 이 사람만 다른
       저장소에 계정이 생긴다. 잠시 뒤 다시 시도하면 정상 경로로 가입된다. */
    if (isTransientSchemaCacheError(finalError)) {
      return NextResponse.json(
        { error: "지금은 가입 처리를 할 수 없습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }
    if (supabaseUrl && supabasePublicKey && shouldFallbackToSupabaseAuth(finalError)) {
      // 운영 DB 스키마/권한 편차가 있으면 Supabase Auth 기본 경로로 자동 우회
      await recordConsent(sb, email, consent, ip, ua);
      const verifyRedirect = emailConfirmationEnabled()
        ? `${canonicalOrigin(req)}/auth/confirm?next=${encodeURIComponent(`/login?verified=1&email=${encodeURIComponent(email)}`)}`
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
