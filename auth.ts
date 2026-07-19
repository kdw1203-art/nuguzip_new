import NextAuth from "next-auth";
import type { JWT } from "@auth/core/jwt";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Naver from "next-auth/providers/naver";
import Kakao from "next-auth/providers/kakao";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import type { UserRole } from "@/lib/auth/types";
import {
  isSupabaseConfigured,
  isSupabasePasswordLoginConfigured,
} from "@/lib/supabase/flags";
import { isTossLoginEnabled } from "@/lib/auth/toss-login";
import {
  linkKakaoUser,
  parseKakaoSignInPayload,
} from "@/lib/auth/kakao-user-store";
import { KAKAO_LOGIN_SCOPES } from "@/lib/kakao/oauth-config";
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
    if (!warnedMissingAuthSecret) {
      logger.error(
        "[auth] AUTH_SECRET is missing in production. Falling back to dev secret; set AUTH_SECRET immediately.",
      );
      warnedMissingAuthSecret = true;
    }
  }
  return DEV_AUTH_SECRET_FALLBACK;
}

const googleConfigured =
  Boolean(process.env.AUTH_GOOGLE_ID) &&
  Boolean(process.env.AUTH_GOOGLE_SECRET);
const naverConfigured =
  Boolean(process.env.AUTH_NAVER_ID) &&
  Boolean(process.env.AUTH_NAVER_SECRET);
const kakaoConfigured =
  Boolean(process.env.AUTH_KAKAO_ID) &&
  Boolean(process.env.AUTH_KAKAO_SECRET);

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
  !naverConfigured &&
  !supabasePassword;

/**
 * 비상 토큰 로그인 — EMERGENCY_ACCESS_TOKEN 환경변수에 임의의 긴 토큰을 넣으면
 * 로그인 페이지에 토큰 입력창이 표시됩니다. 토큰이 일치하면 관리자 이메일로 로그인됩니다.
 * Vercel 대시보드에서 EMERGENCY_ACCESS_TOKEN=<임의의 긴 문자열> 만 추가하면 즉시 로그인 가능.
 */
const emergencyTokenConfigured = Boolean(
  process.env.EMERGENCY_ACCESS_TOKEN?.trim(),
);

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
    ...(naverConfigured
      ? [
          Naver({
            clientId: process.env.AUTH_NAVER_ID,
            clientSecret: process.env.AUTH_NAVER_SECRET,
          }),
        ]
      : []),
    ...(kakaoConfigured
      ? [
          Kakao({
            clientId: process.env.AUTH_KAKAO_ID,
            clientSecret: process.env.AUTH_KAKAO_SECRET,
            authorization: {
              params: {
                scope: KAKAO_LOGIN_SCOPES.join(" "),
              },
            },
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
              return authorizeWithPassword(
                credentials as
                  | Record<"email" | "password", string>
                  | undefined,
              );
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
              if (!token || !expected || token !== expected) return null;
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
    async signIn({ user, account, profile }) {
      if (account?.provider !== "kakao") return;
      const payload = parseKakaoSignInPayload({
        accountProviderAccountId: account.providerAccountId,
        userEmail: user.email,
        userName: user.name,
        userImage: user.image,
        profile,
      });
      if (!payload) return;
      try {
        await linkKakaoUser(payload);
      } catch (e) {
        logger.warn("[auth] kakao link failed", e);
      }
    },
  },
});
