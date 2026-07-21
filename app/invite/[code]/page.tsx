import Link from "next/link";
import { cookies } from "next/headers";
import { Icon } from "@/app/components/Icon";
import { getReferralByCode } from "@/lib/referral/store";

/**
 * 공개 초대 랜딩 — /invite/[code].
 *
 * 방문 시 ref_code 쿠키를 심는다(httpOnly:false, path=/, 30일). 이후 사용자가
 * 가입/로그인을 마치면 전역에 마운트된 <ReferralRedeem/> 가 쿠키를 읽어
 * /api/referral/redeem 을 호출해 양쪽에 300P를 적립한다.
 *
 * 쿠키 세팅은 2중화한다.
 *  1) 서버: cookies().set — 가능한 렌더 단계에서만(대개 no-op이라 try/catch).
 *  2) 클라이언트: 아래 인라인 스크립트가 document.cookie 로 확실히 심는다.
 *     (CSP script-src 에 'unsafe-inline' 허용 확인됨)
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "친구 초대 · 누구집",
  robots: { index: false, follow: false },
};

const COOKIE_NAME = "ref_code";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30일(초)

/** 스크립트/쿠키에 넣기 전 코드 안전화 — [A-Z0-9] 만 허용. */
function sanitizeCode(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

/** 추천인 이메일 마스킹 — "ab***@domain". */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "친구";
  const head = email.slice(0, Math.min(2, at));
  return `${head}***@${email.slice(at + 1)}`;
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = sanitizeCode(rawCode);

  // 1) 서버 쿠키 세팅 (가능한 단계에서만; 렌더 단계에선 throw → 흡수)
  if (code) {
    try {
      const jar = await cookies();
      jar.set(COOKIE_NAME, code, {
        path: "/",
        maxAge: COOKIE_MAX_AGE,
        httpOnly: false,
        sameSite: "lax",
      });
    } catch {
      /* 렌더 단계에서는 변경 불가 → 아래 클라이언트 스크립트가 처리 */
    }
  }

  // 코드가 유효하면 추천인 표시, 아니면 일반 초대로 폴백 (crash 금지)
  const ref = code ? await getReferralByCode(code) : null;
  const inviter = ref ? maskEmail(ref.referrerEmail) : null;

  // 2) 클라이언트 쿠키 세팅 (실질적으로 여기서 심긴다)
  const cookieScript = code
    ? `try{document.cookie=${JSON.stringify(
        `${COOKIE_NAME}=${code}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`,
      )};}catch(e){}`
    : "";

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col items-center justify-center px-5 py-12">
      {code ? <script dangerouslySetInnerHTML={{ __html: cookieScript }} /> : null}

      <div className="card glass w-full rounded-[22px] p-7 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name="gift" size={28} />
        </div>

        {inviter ? (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-[12px] font-bold text-primary">
            <Icon name="user-plus" size={13} />
            <span>{inviter} 님의 초대</span>
          </div>
        ) : (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-[12px] font-bold text-primary">
            <Icon name="user-plus" size={13} />
            <span>친구의 초대</span>
          </div>
        )}

        <h1 className="text-[21px] font-extrabold leading-[1.35] text-text-1">
          친구가 초대했어요
          <br />
          가입하면 <span className="text-primary">둘 다 300P</span>
        </h1>

        <p className="mt-2 text-[13px] leading-[1.6] text-text-3">
          초대 링크로 가입을 완료하면 초대한 친구와 나 모두에게
          <br className="hidden sm:block" /> 300P를 바로 드려요.
        </p>

        <div className="mt-5 flex flex-col gap-2 text-left">
          {[
            { icon: "coin", t: "가입 즉시 300P", d: "나와 초대한 친구 모두 적립" },
            { icon: "trending-up", t: "실거래가·시세 열람", d: "관심 단지 가격을 한눈에" },
            { icon: "sparkles", t: "AI 분석·리포트", d: "포인트로 바로 이용" },
          ].map((b) => (
            <div
              key={b.t}
              className="flex items-center gap-3 rounded-[14px] bg-surface px-3.5 py-2.5"
              style={{ border: "1px solid var(--border)" }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Icon name={b.icon} size={16} />
              </span>
              <div>
                <div className="text-[13px] font-bold text-text-1">{b.t}</div>
                <div className="text-[11px] text-text-3">{b.d}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <Link
            href="/signup"
            className="btn-primary btn-cta press rounded-[12px] py-3.5 text-center text-[15px] font-bold no-underline"
          >
            카카오 · 구글로 3초 가입하고 300P 받기
          </Link>
          <Link
            href="/login"
            className="press rounded-[12px] py-2.5 text-center text-[13px] font-semibold text-text-2 no-underline"
          >
            이미 계정이 있어요 · 로그인
          </Link>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1 text-[11px] text-text-3">
          <Icon name="check" size={12} className="text-primary" />
          가입만 완료하면 포인트가 자동으로 적립돼요
        </p>
      </div>

      <p className="mt-4 text-center text-[11px] text-text-3">
        누구집 · 실거래가 · 임장노트 · 부동산 커뮤니티
      </p>
    </main>
  );
}
