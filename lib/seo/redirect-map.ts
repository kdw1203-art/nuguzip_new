/**
 * N6 — 죽은 URL 리다이렉트 맵
 *
 * 라우트를 지우거나 옮기면 그 URL 로 들어오던 외부 링크·북마크·검색엔진 색인이
 * 그냥 404 로 증발한다. 그래서 "없어진 경로 → 지금 그 역할을 하는 경로" 를
 * 코드로 관리하는 표를 둔다. 서치콘솔 크롤 오류에 죽은 URL 이 잡히면 여기에
 * 한 줄 추가하는 것이 정해진 절차다.
 *
 * ── 왜 미들웨어에서 떼어 왔나 ─────────────────────────────────────────────
 * 이 표는 데이터고 middleware.ts 는 보안 헤더·세션·게이트가 얽힌 실행 코드다.
 * 섞여 있으면 (1) 표를 고치려고 보안 코드를 열어야 하고 (2) 검증 스크립트가
 * next/server 를 끌어들이지 않고는 표를 읽을 수 없다. 이 파일은 의존성이
 * 하나도 없어서 Edge 미들웨어와 node 검사 스크립트가 똑같이 읽는다.
 *
 * ── 규칙 ──────────────────────────────────────────────────────────────────
 * 1. from 은 정확 일치 경로. 앞에 "/", 뒤 슬래시 없음, 쿼리 없음.
 * 2. to 는 **실존하는 라우트**여야 하고 **한 홉**이어야 한다. 다른 규칙의
 *    from 을 가리키면 2단 홉이 되어 색인 이관이 새어 나간다.
 * 3. **살아 있는 라우트를 from 으로 쓰면 안 된다.** 미들웨어는 파일 시스템
 *    라우트보다 먼저 돌기 때문에, 실수로 넣으면 멀쩡한 페이지가 조용히
 *    가려진다(실제로 /reports 가 그렇게 하루 동안 가려져 있었다 — 아래 참고).
 * 위 세 가지는 scripts/check-redirect-map.mjs 가 매 릴리스마다 검사한다.
 *
 * ── since 의 의미 ─────────────────────────────────────────────────────────
 * "이 규칙이 표에 들어온 날"이다. 레거시 블록의 2026-07-20 은 개편 커밋
 * dfd6a4d 에서 83개를 전수 점검·수리한 날이며, 그 이전의 개별 등록일은
 * 확인하지 않았다. 확인하지 않은 것을 확인한 척 적지 않는다.
 *
 * ── 상태 코드: 왜 301 인가 ────────────────────────────────────────────────
 * GET·HEAD 는 301, 나머지 메서드는 308 로 답한다.
 * - 301 은 이론상 POST 를 GET 으로 바꿔도 되는 코드다. 여기 있는 경로는 전부
 *   문서 탐색용이라 실제로 POST 가 올 일이 없지만, 온다면 메서드를 보존하는
 *   308 이 맞다. 그래서 메서드로 갈랐다.
 * - GET 에 301 을 쓰는 이유는 호환성이다. 301/308 은 구글 기준 색인 이관
 *   효과가 같지만, 308 은 2015년에야 표준이 된 코드라 이를 영구 이전으로
 *   다루지 않는 크롤러·도구가 남아 있다. 301 은 그런 여지가 없다.
 * - "301 은 브라우저가 영구 캐시해서 되돌리기 어렵다"는 통상의 걱정은 여기서는
 *   해당하지 않는다. 미들웨어가 이 응답들에 Cache-Control: no-store 를 붙이기
 *   때문이다(legacy 경로는 PUBLIC_CACHE_RULES 에 없어 shareable=false).
 *   되돌릴 수 있어야 한다는 요구가 실제로 있었다 — /reports 가 그 사례다.
 */

export type RedirectRule = {
  /** 정확 일치 경로 (쿼리 없음, 뒤 슬래시 없음) */
  from: string;
  /** 이동 대상. 쿼리스트링을 붙여도 된다. */
  to: string;
  /** 왜 이 규칙이 있는가 — 나중에 지워도 되는지 판단할 근거 */
  reason: string;
  /** 표에 들어온 날 (YYYY-MM-DD) */
  since: string;
};

type RedirectGroup = {
  reason: string;
  since: string;
  rules: readonly (readonly [from: string, to: string])[];
};

const REDIRECT_GROUPS: readonly RedirectGroup[] = [
  {
    reason: "구 Vite 앱(src/utils/routes.tsx)의 flat 경로 — Next 앱 라우터 경로로 이관",
    since: "2026-07-20",
    rules: [
      ["/register", "/signup"],
      ["/mypage", "/my"],
      ["/my-page", "/my"],
      ["/map-home", "/map"],
      ["/map-price", "/map"],
      ["/map-analysis", "/map"],
      ["/map/price", "/map"],
      ["/map/analysis", "/map"],
      ["/region-comparison", "/map"],
      ["/create-post", "/town/write"],
      ["/create-meeting", "/town/groups"],
      ["/inspection/create-meeting", "/town/groups"],
      ["/create-meeting-market", "/town/market"],
      ["/create-product", "/town/market"],
      ["/market/product/101", "/town/market"],
      ["/meeting-market", "/town/market"],
      ["/content-market", "/town/market"],
      ["/report", "/analysis"],
      ["/subscriptions", "/subscription"],
      ["/subscription-management", "/my"],
      ["/subscription-calendar", "/subscription"],
      ["/subscription-schedule", "/subscription"],
      ["/admin-dashboard", "/admin"],
      ["/inspection-hub", "/notes"],
      ["/inspection/hub", "/notes"],
      ["/my-inspection", "/notes"],
      ["/my-inspections", "/notes"],
      ["/my-inspection-reports", "/notes"],
      ["/inspection/create-report", "/notes"],
      ["/inspection/my-reports", "/notes"],
      ["/inspection/reports", "/notes"],
      ["/inspection/my-schedule", "/notes"],
      ["/comprehensive-calculator", "/calculator"],
      ["/investment-tools", "/calculator"],
      ["/compare-properties", "/search"],
      ["/property-comparison", "/search"],
      ["/apartment-comparison", "/search"],
      ["/properties", "/search"],
      ["/property-search", "/search"],
      ["/real-price", "/search"],
      ["/point-shop", "/subscription"],
      ["/expert", "/town/experts"],
      ["/experts", "/town/experts"],
      ["/expert-matching", "/town/experts"],
      ["/expert-verification", "/town/experts"],
      ["/development-info", "/town/news"],
      ["/news", "/town"],
      ["/notice", "/town"],
      ["/events", "/town"],
      ["/price-prediction", "/analysis/timing"],
      ["/ai-analysis/ai-prediction", "/analysis/timing"],
      ["/ai-analysis", "/analysis"],
      ["/ai", "/analysis"],
      ["/pricing", "/subscription"],
      ["/explore", "/map"],
      ["/calculators", "/calculator"],
      ["/chat", "/town/groups"],
    ],
  },
  {
    reason: "IA 개편 — 커뮤니티·장터·모임을 /town 하위로 편입",
    since: "2026-07-20",
    rules: [
      ["/community", "/town"],
      ["/community/create", "/town/write"],
      ["/community/write", "/town/write"],
      ["/market", "/town/market"],
      ["/market/create", "/town/market"],
      ["/groups/create", "/town/groups"],
    ],
  },
  {
    reason: "법적 고지 문서를 /legal/* 로 이관",
    since: "2026-07-20",
    rules: [
      ["/terms", "/legal/terms"],
      ["/privacy", "/legal/privacy"],
    ],
  },
  {
    reason: "인증 경로를 /auth/* 에서 루트로 평탄화",
    since: "2026-07-20",
    rules: [
      ["/auth/login", "/login"],
      ["/auth/signup", "/signup"],
      ["/auth/register", "/signup"],
      ["/auth/forgot-password", "/forgot-password"],
      ["/auth/reset-password", "/reset-password"],
    ],
  },
  {
    reason: "계산기 세부 페이지를 단일 /calculator 로 통합",
    since: "2026-07-20",
    rules: [
      ["/calculator/acquisition", "/calculator"],
      ["/calculator/rent-vs-buy", "/calculator"],
      ["/calculator/tax", "/calculator"],
      ["/calculator/investment", "/calculator"],
    ],
  },
  {
    reason: "중복 페이지 삭제(dfd6a4d) — canonical 페이지로 흡수",
    since: "2026-07-20",
    rules: [
      ["/upgrade", "/subscription"],
      ["/my/dashboard", "/my"],
      ["/library", "/my"],
      ["/billing/success", "/payment/success?provider=stripe"],
    ],
  },
  {
    reason: "구 정보·개발용 페이지 삭제 — 대응 허브 또는 홈으로",
    since: "2026-07-20",
    rules: [
      ["/info/public-data", "/"],
      ["/info/redevelopment", "/town/news"],
      ["/supabase-guide", "/"],
      ["/supabase-connect", "/"],
    ],
  },
];

/* 규칙을 평탄화하면서 from 중복을 즉시 터뜨린다.
   Record 리터럴로 두면 뒤에 온 값이 앞을 조용히 덮어써서, 표에는 두 줄이
   보이는데 실제로는 한 줄만 사는 상태가 된다. */
function flatten(groups: readonly RedirectGroup[]): readonly RedirectRule[] {
  const seen = new Map<string, string>();
  const out: RedirectRule[] = [];
  for (const group of groups) {
    for (const [from, to] of group.rules) {
      const previous = seen.get(from);
      if (previous !== undefined) {
        throw new Error(
          `[redirect-map] from "${from}" 이 두 번 나옵니다 — "${previous}" 와 "${to}" 중 하나를 지우세요.`,
        );
      }
      seen.set(from, to);
      out.push({ from, to, reason: group.reason, since: group.since });
    }
  }
  return out;
}

export const REDIRECT_RULES: readonly RedirectRule[] = flatten(REDIRECT_GROUPS);

/** 미들웨어용 O(1) 조회 표. */
export const EXACT_REDIRECTS: Record<string, string> = Object.fromEntries(
  REDIRECT_RULES.map((rule) => [rule.from, rule.to]),
);

/**
 * 레거시 경로 리다이렉트의 상태 코드.
 * 이유는 파일 상단 주석 참고 — 요약하면 크롤러 호환성은 301, 메서드 보존은 308.
 */
export function legacyRedirectStatus(method: string): 301 | 308 {
  return method === "GET" || method === "HEAD" ? 301 : 308;
}
