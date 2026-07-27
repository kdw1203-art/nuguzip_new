import { timingSafeEqual } from "node:crypto";
import NextAuth from "next-auth";
import type { JWT } from "@auth/core/jwt";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import type { UserRole } from "@/lib/auth/types";
import {
  isSupabaseConfigured,
  isSupabasePasswordLoginConfigured,
} from "@/lib/supabase/flags";
import { isTossLoginEnabled } from "@/lib/auth/toss-login";
import { recordAuthLoginOutcome } from "@/lib/auth/login-telemetry";
import { logger } from "@/lib/log";
import { isAllowlistedAdmin, resolveProjectAdminEmail } from "@/lib/auth/admin-emails";

/** 프로덕션에서는 반드시 `AUTH_SECRET` 환경변수를 두세요. 비우면 세션 API가 500 → ClientFetchError 납니다. */
const DEV_AUTH_SECRET_FALLBACK =
  "local-dev-only-secret-do-not-use-in-production-min-32-chars";
let warnedMissingAuthSecret = false;

function resolveAuthSecret(): string | undefined {
  const fromAuth = process.env.AUTH_SECRET?.trim();
  if (fromAuth) return fromAuth;
  const fromLegacy = process.env.NEXTAUTH_SECRET?.trim();
  if (fromLegacy) return fromLegacy;
  if (process.env.NODE_ENV === "production") {
    /* 예전에는 여기서 에러만 찍고 개발용 상수를 그대로 돌려줬다. 그 상수는 이 저장소에
       공개돼 있으므로, 그렇게 뜬 프로덕션은 "세션이 되는" 게 아니라 **누구나 관리자
       세션 토큰을 위조할 수 있는** 상태다. 로그 한 줄로 넘길 문제가 아니라 뜨면 안 되는
       상태라서 던진다 — 부팅 실패가 조용한 인증 우회보다 낫다. 개발 동작은 그대로. */
    if (!warnedMissingAuthSecret) {
      logger.error(
        "[auth] AUTH_SECRET is missing in production. Refusing to boot with the public dev fallback.",
      );
      warnedMissingAuthSecret = true;
    }
    throw new Error(
      "[auth] AUTH_SECRET(또는 NEXTAUTH_SECRET)이 프로덕션에 설정되어 있지 않습니다.",
    );
  }
  return DEV_AUTH_SECRET_FALLBACK;
}

const googleConfigured =
  Boolean(process.env.AUTH_GOOGLE_ID) &&
  Boolean(process.env.AUTH_GOOGLE_SECRET);

const supabasePassword = isSupabasePasswordLoginConfigured();
const tossLoginEnabled = isTossLoginEnabled();

const privateSiteLocked =
  (() => {
    const v = process.env.PRIVATE_SITE?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  })();

/** 비공개 모드에서는 이메일만 넣는 개발용 로그인을 막습니다(무단 접근 방지). */
const devEmailFallback =
  process.env.NODE_ENV !== "production" &&
  !privateSiteLocked &&
  !googleConfigured &&
  !supabasePassword;

/**
 * 비상 토큰 로그인 — EMERGENCY_ACCESS_TOKEN 환경변수에 임의의 긴 토큰을 넣으면
 * 로그인 페이지에 토큰 입력창이 표시됩니다. 토큰이 일치하면 관리자 이메일로 로그인됩니다.
 *
 * 이 프로바이더는 문자열 하나로 **관리자 권한**을 내주는 경로다. 프로덕션 배포에
 * 그냥 켜져 있으면 관리자 계정 전체가 그 환경변수 값 하나의 강도에 달린다. 그래서
 * 프로덕션(VERCEL_ENV=production)에서는 `EMERGENCY_ACCESS_ENABLED=1` 로 명시적으로
 * 켤 때만 등록한다 — 토큰만 남아 있다고 자동으로 살아나지 않는다.
 * (프리뷰/로컬은 종전대로 토큰만 있으면 동작한다.)
 */
const emergencyAccessAllowed =
  process.env.VERCEL_ENV !== "production" ||
  process.env.EMERGENCY_ACCESS_ENABLED?.trim() === "1";

const emergencyTokenConfigured =
  emergencyAccessAllowed && Boolean(process.env.EMERGENCY_ACCESS_TOKEN?.trim());

/**
 * 비밀값 비교는 상수 시간으로 한다. `!==` 는 첫 불일치 바이트에서 즉시 끝나므로
 * 응답 시간 차이로 토큰을 앞에서부터 한 글자씩 맞춰 갈 수 있다. 길이가 다르면
 * timingSafeEqual 이 던지므로 길이를 먼저 본다(길이 노출은 토큰 자체에 비하면 무해하다).
 */
function secretEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * 테스트 계정 로그인 — `TEST_ACCOUNT_ENABLED=1` 일 때만 (운영 기본 off).
 */
const testAccountEnabled = process.env.TEST_ACCOUNT_ENABLED?.trim() === "1";

const testAccountId = process.env.TEST_ACCOUNT_ID?.trim() || "test";
const testAccountPassword = process.env.TEST_ACCOUNT_PASSWORD?.trim() || "test";
const testAccountName = process.env.TEST_ACCOUNT_NAME?.trim() || "test";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: resolveAuthSecret(),
  /** AUTH_URL에 잘못된 pathname이 있어도 라우트가 /api/auth 로 고정되도록 (OAuth 콜백 404 방지) */
  basePath: "/api/auth",
  trustHost: true,
  providers: [
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
    ...(supabasePassword
      ? [
          Credentials({
            id: "password",
            name: "이메일",
            credentials: {
              email: { label: "이메일", type: "email" },
              password: { label: "비밀번호", type: "password" },
            },
            async authorize(credentials) {
              const { authorizeWithPassword } = await import(
                "@/lib/auth/password-login"
              );
              try {
                return await authorizeWithPassword(
                  credentials as
                    | Record<"email" | "password", string>
                    | undefined,
                );
              } catch (e) {
                if (
                  e instanceof Error &&
                  e.message === "EMAIL_NOT_CONFIRMED"
                ) {
                  throw new Error("EMAIL_NOT_CONFIRMED");
                }
                throw e;
              }
            },
          }),
        ]
      : []),
    ...(tossLoginEnabled
      ? [
          Credentials({
            id: "toss",
            name: "토스로 로그인",
            credentials: {
              authorizationCode: { label: "인가 코드", type: "text" },
              referrer: { label: "referrer", type: "text" },
            },
            async authorize(credentials) {
              const code = String(
                credentials?.authorizationCode ?? "",
              ).trim();
              const referrer =
                String(credentials?.referrer ?? "DEFAULT").trim() || "DEFAULT";
              if (!code) return null;
              try {
                const { exchangeTossLogin } = await import(
                  "@/lib/auth/toss-login-api"
                );
                const { linkTossUser } = await import(
                  "@/lib/auth/toss-user-store"
                );
                const { profile, tokens } = await exchangeTossLogin(
                  code,
                  referrer,
                );
                // userKey ↔ app_users 영구 매핑 + 토큰 보관 (best-effort).
                const linked = await linkTossUser(profile, tokens);
                return {
                  id: `toss:${profile.userKey}`,
                  email: linked.email,
                  name: profile.name ?? `토스회원${profile.userKey}`,
                  role: linked.role,
                };
              } catch (e) {
                logger.warn("[auth] toss login failed", e);
                return null;
              }
            },
          }),
        ]
      : []),
    ...(devEmailFallback
      ? [
          Credentials({
            id: "dev-email",
            name: "이메일(개발 전용)",
            credentials: {
              email: { label: "이메일", type: "email" },
            },
            async authorize(credentials) {
              const email = credentials?.email as string | undefined;
              if (!email?.includes("@")) return null;
              return {
                id: email,
                email,
                name: email.split("@")[0] || "사용자",
                role: "user" satisfies UserRole,
              };
            },
          }),
        ]
      : []),
    ...(emergencyTokenConfigured
      ? [
          Credentials({
            id: "emergency-token",
            name: "비상 토큰 로그인",
            credentials: {
              token: { label: "액세스 토큰", type: "password" },
            },
            async authorize(credentials) {
              const token = String(credentials?.token ?? "").trim();
              const expected = process.env.EMERGENCY_ACCESS_TOKEN?.trim();
              if (!token || !expected || !secretEquals(token, expected)) return null;
              const adminEmail = resolveProjectAdminEmail();
              if (!adminEmail) return null;
              return {
                id: adminEmail,
                email: adminEmail,
                name: "관리자",
                role: "admin" satisfies UserRole,
              };
            },
          }),
        ]
      : []),
    ...(testAccountEnabled
      ? [
          Credentials({
            id: "test-account",
            name: "테스트 계정",
            credentials: {
              username: { label: "아이디", type: "text" },
              password: { label: "비밀번호", type: "password" },
            },
            async authorize(credentials) {
              const username = String(credentials?.username ?? "").trim();
              const password = String(credentials?.password ?? "");
              if (username !== testAccountId || password !== testAccountPassword) {
                return null;
              }
              return {
                id: testAccountId,
                email: `${testAccountId}@nuguzip.com`,
                name: testAccountName,
                role: "user" satisfies UserRole,
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }): Promise<JWT> {
      if (user?.email) {
        token.email = user.email;
        const u = user as { id?: string; role?: UserRole };
        token.sub = String(u.id ?? token.sub ?? user.email);
        if (isSupabaseConfigured()) {
          try {
            const profile = await fetchAppUserByEmail(user.email);
            token.role = profile.role;
            token.plan = profile.plan;
          } catch {
            token.role = u.role === "admin" ? "admin" : "user";
            token.plan = "free";
          }
        } else {
          token.role = u.role === "admin" ? "admin" : "user";
          token.plan = "free";
        }
      }
      const sessionEmail =
        (typeof token.email === "string" && token.email) ||
        (typeof user?.email === "string" ? user.email : undefined);
      if (sessionEmail && isAllowlistedAdmin(sessionEmail)) {
        token.role = "admin";
      }

      // 로그인 이후에도 DB plan·role 동기화 (결제·관리자 변경 반영)
      if (
        !user?.email &&
        typeof token.email === "string" &&
        token.email &&
        isSupabaseConfigured()
      ) {
        try {
          const profile = await fetchAppUserByEmail(token.email);
          token.role = profile.role;
          token.plan = profile.plan;
        } catch {
          /* 기존 token 값 유지 */
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id =
          (typeof token.sub === "string" && token.sub) ||
          session.user.email ||
          "";
        session.user.role =
          token.role === "admin" ? "admin" : "user";
        session.user.plan =
          token.plan === "pro" || token.plan === "expert"
            ? token.plan
            : "free";
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      const provider =
        account?.provider === "google"
          ? "google"
          : account?.provider === "password" || account?.provider === "credentials"
            ? "password"
            : "unknown";
      /* password 경로는 authorizeWithPassword 에서 이미 기록 — OAuth만 여기서 */
      if (provider !== "google") return;
      await recordAuthLoginOutcome({
        ok: true,
        provider: "google",
        userEmail: typeof user.email === "string" ? user.email : null,
        path: "/api/auth/callback/google",
      });
    },
  },
});
