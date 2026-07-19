import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  type DictKeyPath,
  type Locale,
} from "./dictionary";

import { LOCALE_COOKIE } from "./constants";
export { LOCALE_COOKIE };

/** 서버 컴포넌트/Server Action 에서 쿠키 기반으로 현재 로케일을 읽습니다. */
export async function getServerLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const raw = store.get(LOCALE_COOKIE)?.value;
    return isLocale(raw) ? raw : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** 서버에서 t() 사용하려면: const t = await serverT(); t("nav.home"). */
export async function serverT(): Promise<
  (key: DictKeyPath, vars?: Record<string, string | number>) => string
> {
  const locale = await getServerLocale();
  return (key, vars) => translate(locale, key, vars);
}
