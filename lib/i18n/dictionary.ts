/**
 * 사전 기반 i18n. `app/[locale]` 전면 재구성 대신 쿠키 로케일 + t() 헬퍼로
 * 점진 도입이 가능하도록 설계했습니다. 새 키가 필요하면 모든 로케일에
 * 동시에 추가하세요(누락 키는 KO 로 폴백).
 */

export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko";

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
};

type Dict = {
  brand: string;
  tagline: string;
  nav: {
    home: string;
    region: string;
    community: string;
    meetings: string;
    experts: string;
    reports: string;
  };
  auth: {
    login: string;
    signup: string;
    logout: string;
    myPage: string;
  };
  footer: {
    about: string;
    business: string;
    privacy: string;
    terms: string;
    fontSize: string;
    language: string;
    copyright: string;
  };
  search: {
    placeholder: string;
    submit: string;
  };
  common: {
    loading: string;
    offline: string;
    retry: string;
    back: string;
  };
};

const KO: Dict = {
  brand: "우리동네이야기",
  tagline: "부동산 커뮤니티 플랫폼",
  nav: {
    home: "홈",
    region: "지역",
    community: "커뮤니티",
    meetings: "모임/마켓",
    experts: "전문가",
    reports: "리포트",
  },
  auth: {
    login: "로그인",
    signup: "회원가입",
    logout: "로그아웃",
    myPage: "마이페이지",
  },
  footer: {
    about: "서비스 소개",
    business: "비즈니스 문의",
    privacy: "개인정보처리방침",
    terms: "이용약관",
    fontSize: "글자 크기",
    language: "언어",
    copyright: "© {year} {brand}. All rights reserved.",
  },
  search: {
    placeholder: "검색어를 입력하세요",
    submit: "검색",
  },
  common: {
    loading: "불러오는 중…",
    offline: "오프라인입니다",
    retry: "다시 시도",
    back: "돌아가기",
  },
};

const EN: Dict = {
  brand: "Woodong",
  tagline: "Real Estate Community Platform",
  nav: {
    home: "Home",
    region: "Region",
    community: "Community",
    meetings: "Meetings / Market",
    experts: "Experts",
    reports: "Reports",
  },
  auth: {
    login: "Log in",
    signup: "Sign up",
    logout: "Log out",
    myPage: "My page",
  },
  footer: {
    about: "About",
    business: "Business inquiry",
    privacy: "Privacy policy",
    terms: "Terms of service",
    fontSize: "Font size",
    language: "Language",
    copyright: "© {year} {brand}. All rights reserved.",
  },
  search: {
    placeholder: "Search…",
    submit: "Search",
  },
  common: {
    loading: "Loading…",
    offline: "You are offline",
    retry: "Retry",
    back: "Go back",
  },
};

const DICTIONARIES: Record<Locale, Dict> = { ko: KO, en: EN };

export type DictKeyPath =
  | "brand"
  | "tagline"
  | `nav.${keyof Dict["nav"]}`
  | `auth.${keyof Dict["auth"]}`
  | `footer.${keyof Dict["footer"]}`
  | `search.${keyof Dict["search"]}`
  | `common.${keyof Dict["common"]}`;

function pick(dict: Dict, keyPath: string): string | undefined {
  const parts = keyPath.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

export function translate(
  locale: Locale,
  key: DictKeyPath,
  vars?: Record<string, string | number>,
): string {
  const raw = pick(DICTIONARIES[locale], key) ?? pick(DICTIONARIES[DEFAULT_LOCALE], key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`,
  );
}

export function isLocale(x: string | undefined | null): x is Locale {
  return !!x && (LOCALES as readonly string[]).includes(x);
}
