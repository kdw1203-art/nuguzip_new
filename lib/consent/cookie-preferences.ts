export const COOKIE_CONSENT_KEY = "woodong_cookie_consent_v1";
export const COOKIE_CONSENT_EVENT = "woodong:cookie-consent";

export type CookieConsent = {
  necessary: true;
  analytics: boolean;
  advertising: boolean;
  updatedAt: string;
};

export function defaultConsent(): CookieConsent {
  return {
    necessary: true,
    analytics: false,
    advertising: false,
    updatedAt: new Date().toISOString(),
  };
}

export function readCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    if (typeof parsed.analytics !== "boolean") return null;
    if (typeof parsed.advertising !== "boolean") return null;
    return {
      necessary: true,
      analytics: parsed.analytics,
      advertising: parsed.advertising,
      updatedAt: String(parsed.updatedAt ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

export function saveCookieConsent(consent: Omit<CookieConsent, "necessary" | "updatedAt">): CookieConsent {
  const next: CookieConsent = {
    necessary: true,
    analytics: consent.analytics,
    advertising: consent.advertising,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: next }));
  return next;
}

export function hasAnalyticsConsent(): boolean {
  return readCookieConsent()?.analytics === true;
}

export function hasAdvertisingConsent(): boolean {
  return readCookieConsent()?.advertising === true;
}
