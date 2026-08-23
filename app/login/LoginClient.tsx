"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { safeInternalPath } from "@/lib/safe-path";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Logo } from "@/app/components/Logo";
import { Icon } from "@/app/components/Icon";
import { useMoment } from "@/app/components/motion/MomentProvider";

import type { SocialProvider } from "@/lib/auth/configured-social";
import { trackPlatformEvent } from "@/lib/platform-events-client";

export type { SocialProvider };

/** `?callbackUrl=` 이 있으면 로그인 후 그 경로로 복귀 (내부 경로만 허용) */
function resolveCallbackUrl(): string {
  if (typeof window === "undefined") return "/";
  const cb = new URLSearchParams(window.location.search).get("callbackUrl");
  /* `//evil.com` 뿐 아니라 `/\evil.com` 도 막아야 한다 — 브라우저는 URL 파싱에서
     백슬래시를 슬래시로 정규화하므로 `/\evil.com` 은 `//evil.com` 과 같게 취급된다. */
  return safeInternalPath(cb, "/");
}

/* ---------- 진입 맥락 ----------
 *
 * 2026-07-27: 이 화면 위쪽에는 "방금 쓴 노트, 잃어버리지 않게 저장할게요" 라는
 * 제목과 "공작아파트 302동 · 오늘 / 체크 6항목 · 사진 4장 · 고려사항 2건" 카드가
 * **하드코딩**되어 있었다. 사용자가 쓴 적 없는 노트다.
 *
 * 코드에서 /login 으로 보내는 자리를 전부 세어 보면 25곳인데, 그중 노트 작성
 * 흐름은 app/notes/new/NoteForm.tsx 하나뿐이다. 나머지 24곳(구독·매물·분양·
 * 알림·관심단지·임장모임·포인트·추천·관리자…)에서 온 사람은 전부 "방금 쓴 노트"
 * 라는 문장과 남의 단지 이름을 보게 된다. 소유자가 "저 공간은 뭐하는 곳인지
 * 모르겠다"고 한 것이 정확한 반응이다 — 그 사람에게는 실제로 아무 의미가 없다.
 *
 * 그래서 지어낸 노트 카드를 걷어내고, callbackUrl 이 실제로 가리키는 경로에서만
 * 문구를 고른다. 맞는 경로가 없으면 일반 문구로 간다. 노트 문구는 정말 노트
 * 작성 중에 로그인 벽을 만난 사람에게만 나간다. */
type LoginContext = { line1: string; line2: string; sub: string };

/* 문구도 **실제로 켜져 있는 로그인 수단**만 말한다.
   "카카오·네이버·구글" 을 고정 문자열로 박아 두면, 그 셋 중 하나도 설정돼
   있지 않은 상태에서도 화면은 세 가지로 시작할 수 있다고 말하게 된다. */
const SOCIAL_LABEL: Record<SocialProvider, string> = {
  google: "구글",
  toss: "토스",
};

const SOCIAL_BUTTON: Record<SocialProvider, { label: string; className: string }> = {
  toss: {
    label: "토스로 3초 만에 시작",
    className: "bg-[#3182f6] text-white shadow-[0_6px_16px_rgba(49,130,246,.35)]",
  },
  google: {
    label: "Google로 시작",
    className: "border border-line bg-surface text-text-1",
  },
};

function genericContext(social: SocialProvider[]): LoginContext {
  return {
    line1: "누구집 계정으로",
    line2: "임장 기록을 이어가세요",
    sub: social.length
      ? `${social.map((p) => SOCIAL_LABEL[p]).join("·")} 계정으로 3초면 시작할 수 있어요`
      : "이메일 계정으로 임장 기록을 이어서 저장할 수 있어요",
  };
}

/* 앞에서부터 순서대로 검사한다 — 더 구체적인 경로를 위에 둔다.
   여기 적힌 경로는 전부 실제로 /login?callbackUrl= 을 만드는 자리에서 가져왔다. */
const CONTEXT_RULES: { prefix: string; ctx: LoginContext }[] = [
  {
    prefix: "/notes",
    ctx: {
      line1: "방금 쓴 노트,",
      line2: "잃어버리지 않게 저장할게요",
      sub: "로그인하면 작성하던 내용 그대로 이어서 저장돼요",
    },
  },
  {
    prefix: "/subscription",
    ctx: {
      line1: "플랜을 고르려면",
      line2: "먼저 로그인이 필요해요",
      sub: "로그인하면 보던 구독 화면으로 그대로 돌아갑니다",
    },
  },
  {
    prefix: "/listings",
    ctx: {
      line1: "매물 문의·등록은",
      line2: "로그인 후 이용할 수 있어요",
      sub: "로그인하면 보던 매물 화면으로 그대로 돌아갑니다",
    },
  },
  {
    prefix: "/dev-deals",
    ctx: {
      line1: "분양·개발 정보 문의는",
      line2: "로그인 후 이용할 수 있어요",
      sub: "로그인하면 보던 화면으로 그대로 돌아갑니다",
    },
  },
  {
    prefix: "/town/groups",
    ctx: {
      line1: "임장 모임 참여는",
      line2: "로그인 후 이용할 수 있어요",
      sub: "로그인하면 보던 모임 화면으로 그대로 돌아갑니다",
    },
  },
  {
    prefix: "/qna",
    ctx: {
      line1: "단지 Q&A 질문·답변은",
      line2: "로그인 후 남길 수 있어요",
      sub: "로그인하면 보던 질문 화면으로 그대로 돌아갑니다",
    },
  },
  {
    prefix: "/notifications",
    ctx: {
      line1: "알림함은",
      line2: "로그인 후 볼 수 있어요",
      sub: "로그인하면 알림함으로 바로 이동합니다",
    },
  },
  {
    prefix: "/my",
    ctx: {
      line1: "내 정보는",
      line2: "로그인 후 볼 수 있어요",
      sub: "로그인하면 보던 화면으로 그대로 돌아갑니다",
    },
  },
  {
    prefix: "/points",
    ctx: {
      line1: "포인트 사용은",
      line2: "로그인 후 이용할 수 있어요",
      sub: "로그인하면 보던 화면으로 그대로 돌아갑니다",
    },
  },
  {
    prefix: "/recommend",
    ctx: {
      line1: "맞춤 추천은",
      line2: "로그인 후 받아볼 수 있어요",
      sub: "로그인하면 추천 화면으로 바로 이동합니다",
    },
  },
];

function contextForCallback(cb: string, fallback: LoginContext): LoginContext {
  const hit = CONTEXT_RULES.find((r) => cb === r.prefix || cb.startsWith(`${r.prefix}/`));
  return hit ? hit.ctx : fallback;
}

/* 로그인 계정으로 실제로 할 수 있는 것만 적는다 — 각 항목은 코드에 로그인 벽이
   실제로 걸려 있는 기능이다(노트 저장·관심단지·Q&A 작성·모임 참여). 없는 기능을
   미끼로 적지 않는다. */
const ACCOUNT_BENEFITS: { icon: string; label: string; desc: string }[] = [
  { icon: "📝", label: "임장노트 저장", desc: "현장에서 적은 체크·사진을 계정에 보관" },
  { icon: "⭐", label: "관심 단지", desc: "보던 단지를 모아두고 다시 찾기" },
  { icon: "💬", label: "단지 Q&A", desc: "궁금한 단지에 질문하고 답변 남기기" },
  { icon: "🧭", label: "임장 모임", desc: "같이 볼 사람들과 모임 참여" },
];

/**
 * 소셜 로그인 버튼은 **서버가 확인한 목록**만 그린다.
 *
 * 2026-07-28: 운영에서 `/api/auth/providers` 가 `password` 하나만 돌려주는데
 * 화면에는 카카오·네이버·구글 버튼 셋이 다 떠 있었다. 누르면 NextAuth 가
 * `/api/auth/error?error=Configuration` 으로 보낸다 — 눌러야만 없다는 걸 아는
 * 버튼이다. 없는 수단을 그려 두는 건 연출이 아니라 잘못된 정보다.
 *
 * 그래서 부모(서버 컴포넌트)가 env 로 켜진 provider 만 넘겨준다. 클라이언트에서
 * `/api/auth/providers` 를 fetch 하는 방법도 있지만, 첫 렌더에 버튼이 있다가
 * 사라지는 깜빡임이 생기고 그 사이 클릭하면 같은 에러를 그대로 맞는다.
 */
export function LoginClient({ social }: { social: SocialProvider[] }) {
  const router = useRouter();
  const { showMoment } = useMoment();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [verifiedNotice, setVerifiedNotice] = useState(false);

  /* callbackUrl 은 window 에만 있다. 서버 렌더 결과와 첫 클라이언트 렌더가
     달라지면 하이드레이션이 깨지므로, 일반 문구로 시작해서 마운트 후에만
     구체 문구로 바꾼다. (useSearchParams 를 쓰면 Suspense 경계가 필요하다) */
  const generic = useMemo(() => genericContext(social), [social]);
  const [ctx, setCtx] = useState<LoginContext>(generic);
  useEffect(() => {
    setCtx(contextForCallback(resolveCallbackUrl(), generic));
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") setVerifiedNotice(true);
    const prefill = params.get("email");
    if (prefill?.includes("@")) setEmail(prefill);
    if (params.get("error") === "verify_failed") {
      setError("이메일 인증에 실패했습니다. 메일의 링크를 다시 눌러 주세요.");
    }
    /* Auth.js OAuth 실패 시 ?error=… — 실패율 계측(비밀번호·이메일 미포함) */
    const oauthErr = params.get("error");
    if (
      oauthErr &&
      oauthErr !== "verify_failed" &&
      ["OAuthSignin", "OAuthCallback", "OAuthCreateAccount", "Callback", "AccessDenied", "Configuration"].some(
        (c) => oauthErr === c || oauthErr.toLowerCase().includes(c.toLowerCase()),
      )
    ) {
      trackPlatformEvent({
        eventName: "auth_login_fail",
        source: "auth",
        campaign: "login_monitor",
        path: "/login",
        metadata: { provider: "google", reason: "oauth_error", code: oauthErr.slice(0, 40) },
      });
    }
  }, [generic]);

  async function socialSignIn(provider: SocialProvider) {
    setError(null);
    setBusy(provider);
    // 토스는 NextAuth OAuth 가 아니라 자체 리다이렉트 시작점을 쓴다 —
    // 인가 후 /auth/toss/callback 에서 세션이 만들어진다.
    if (provider === "toss") {
      window.location.href = `/api/auth/toss/start?callbackUrl=${encodeURIComponent(resolveCallbackUrl())}`;
      return;
    }
    try {
      // OAuth는 리다이렉트 플로우 — 성공 시 callbackUrl(기본 /) 로 돌아옵니다.
      await signIn(provider, { callbackUrl: resolveCallbackUrl() });
    } catch {
      setError("로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setBusy(null);
    }
  }

  async function passwordSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!email.trim().includes("@")) {
      setError("올바른 이메일을 입력해 주세요.");
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    setBusy("password");
    try {
      const res = await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: resolveCallbackUrl(),
      });
      if (res?.error) {
        const detail = `${res.error} ${res.code ?? ""}`.toLowerCase();
        if (detail.includes("email_not_confirmed")) {
          setError("이메일 인증이 아직 안 됐어요. 받은 인증 메일의 링크를 눌러 주세요.");
        } else {
          setError(
            "이메일 또는 비밀번호가 올바르지 않습니다. 가입 직후라면 인증 메일도 확인해 주세요.",
          );
        }
        return;
      }
      if (res?.ok) {
        /* 이동보다 먼저 부른다. Provider 가 루트에 있어서 화면이 바뀌어도
           장면은 이어진다 — 오히려 그 편이 전환을 덮어 준다. */
        showMoment({
          title: "로그인됐어요",
          subtitle: "기록해 둔 임장노트를 이어서 볼 수 있어요",
        });
        router.push(resolveCallbackUrl());
        router.refresh();
        return;
      }
      setError("로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col px-7 pb-8"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
    >
      <div className="flex justify-end">
        <Link href="/" className="text-[17px] text-text-3" aria-label="닫기">
          ✕
        </Link>
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-3.5">
        <div className="rise-in">
          <Logo size={34} />
        </div>
        <h1 className="rise-in-1 text-[22px] font-extrabold leading-[1.35] text-ink">
          {ctx.line1}
          <br />
          {ctx.line2}
        </h1>
        <p className="rise-in-2 text-sm text-text-2">{ctx.sub}</p>

        {verifiedNotice && (
          <div
            role="status"
            className="rise-in rounded-[12px] bg-primary-soft px-4 py-3 text-[13px] font-bold text-primary"
          >
            이메일 인증이 완료됐어요. 이제 로그인해 주세요.
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rise-in rounded-[12px] bg-danger-soft px-4 py-3 text-[13px] font-bold text-danger"
          >
            {error}
          </div>
        )}

        {/* 소셜을 이메일 폼·혜택 카드보다 위에 둔다 — 모바일 첫 화면에서
            스크롤 없이 Google 버튼을 바로 보이게 한다. */}
        {social.length > 0 && (
          <div className="rise-in-3 flex flex-col gap-2.5">
            {social.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => socialSignIn(provider)}
                disabled={busy !== null}
                className={`rounded-[14px] p-3.5 text-center text-[15px] font-bold disabled:opacity-60 ${SOCIAL_BUTTON[provider].className}`}
              >
                {SOCIAL_BUTTON[provider].label}
              </button>
            ))}
            <div className="flex items-center gap-3 text-[11px] text-text-3">
              <span className="h-px flex-1 bg-bg" />
              또는 이메일로
              <span className="h-px flex-1 bg-bg" />
            </div>
          </div>
        )}

        <form onSubmit={passwordSignIn} className="rise-in-3 flex flex-col gap-2">
          {/* 항목 47 — placeholder 는 접근 가능한 이름이 아니다(첫 타이핑에
              사라지고, 음성 제어로 지목할 수 없다). sr-only 라벨 + id. */}
          <label htmlFor="login-email" className="sr-only">
            이메일
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            autoComplete="email"
            className="rounded-[12px] border border-line bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-primary"
          />
          <label htmlFor="login-password" className="sr-only">
            비밀번호
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            className="rounded-[12px] border border-line bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy !== null}
            className="btn-primary rounded-[12px] p-3 text-center text-sm font-bold disabled:opacity-60"
          >
            {busy === "password" ? "로그인 중…" : "이메일로 로그인"}
          </button>
          <div className="text-center">
            <Link href="/forgot-password" className="text-xs font-bold text-text-2">
              비밀번호를 잊으셨나요?
            </Link>
          </div>
        </form>

        <ul className="rise-in-4 grid grid-cols-2 gap-2">
          {ACCOUNT_BENEFITS.map((b) => (
            <li
              key={b.label}
              className="card flex flex-col gap-1 rounded-[14px] px-3.5 py-3"
            >
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                <Icon name={b.icon} size={15} />
                {b.label}
              </span>
              <span className="text-[11px] leading-[1.5] text-text-3">{b.desc}</span>
            </li>
          ))}
        </ul>

        <div className="rise-in-5 text-center text-xs text-text-3">
          처음이신가요?{" "}
          <Link href="/signup" className="font-bold text-primary">
            회원가입 온보딩
          </Link>
        </div>
        <p className="text-center text-[11px] leading-[1.6] text-text-3">
          시작하면 이용약관·개인정보처리방침에 동의하게 됩니다
        </p>
      </div>
    </main>
  );
}
