/* [#51, 2026-08-23] 단지 한글 슬러그 — 엣지(미들웨어)·서버 겸용 순수 모듈.
 *
 * URL 형태: /complex/{한글슬러그}.{base64url-id}
 *   예: /complex/서울-강남구-은마.7JqU7Iq4...
 *
 * 설계 근거:
 *  - 식별자는 **여전히 base64url(region ‖ \x01 ‖ name)** 하나다(마지막 "." 뒤).
 *    슬러그는 장식 — 사람·검색엔진이 읽는 키워드 신호이고, 해석은 항상 꼬리 id 로만
 *    한다. 그래서 슬러그가 낡아도(단지명 변경 등) 링크는 절대 죽지 않는다.
 *  - kapt 코드 꼬리안(준비 모듈의 원안)은 폐기: 사이트맵 26,126개 단지 중 kapt
 *    매칭이 4,482개(17%)뿐이라(2026-08-23 실측) 마이그레이션이 되지 못한다.
 *    base64 꼬리는 100% 커버리지 + DB 조회 0회로 미들웨어에서 정규화가 끝난다.
 *  - base64url 문자셋([A-Za-z0-9_-])에는 "." 이 없어 마지막 "." 분리가 항상 안전하다.
 *    kapt.* id 는 예외 프리픽스로 먼저 걸러낸다.
 *
 * 롤백 스위치: NEXT_PUBLIC_COMPLEX_URL_STYLE=code 로 빌드하면 슬러그 발급·강제
 * 리다이렉트가 모두 꺼지고 기존 base64 URL 이 표준으로 돌아간다(장식 URL 은
 * 그대로 동작 — 해석이 꼬리 id 라서다).
 *
 * ⚠ Buffer 금지 — 미들웨어는 Edge 런타임이다. atob + TextDecoder 만 쓴다.
 */

/** complex-store 의 SEP 와 같은 값 — 두 모듈이 갈라지면 안 된다. */
export const COMPLEX_ID_SEP = String.fromCharCode(1);

export const KAPT_PREFIX = "kapt.";

export function slugStyleEnabled(): boolean {
  return process.env.NEXT_PUBLIC_COMPLEX_URL_STYLE !== "code";
}

/** 한글·영숫자를 살린 URL 슬러그 (하이픈 연결, 최대 60자). 빈 결과 가능. */
export function toComplexSlug(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/[^0-9A-Za-z가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** base64url → UTF-8 (Edge 안전). 실패 시 null. */
export function base64urlToUtf8(id: string): string | null {
  try {
    const b64 =
      id.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (id.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** name-id(base64url) → { region, name }. kapt·비정상 id 는 null. */
export function decodeNameIdSafe(id: string): { region: string; name: string } | null {
  if (!id || id.startsWith(KAPT_PREFIX)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  const raw = base64urlToUtf8(id);
  if (!raw) return null;
  const idx = raw.indexOf(COMPLEX_ID_SEP);
  if (idx <= 0) return null;
  const region = raw.slice(0, idx);
  const name = raw.slice(idx + 1);
  if (!region || !name) return null;
  return { region, name };
}

/** (region, name, pureId) → 라우트 파라미터 문자열(비인코딩). 슬러그가 비면 pureId 그대로. */
export function decoratedParam(region: string, name: string, pureId: string): string {
  if (!slugStyleEnabled()) return pureId;
  const slug = toComplexSlug(`${region} ${name}`);
  return slug ? `${slug}.${pureId}` : pureId;
}

/** URL 파라미터에서 순수 id 를 뽑는다 (장식 슬러그 제거). kapt.* 는 그대로. */
export function pureIdFromParam(param: string): string {
  const p = param.trim();
  if (!p || p.startsWith(KAPT_PREFIX)) return p;
  const dot = p.lastIndexOf(".");
  return dot >= 0 ? p.slice(dot + 1) : p;
}

/**
 * 미들웨어용 정규화 판정. 반환:
 *  - null: 그대로 통과 (kapt·해석 불가·이미 표준·슬러그 스타일 꺼짐)
 *  - string: 이 파라미터(비인코딩)로 308 해야 함
 */
export function expectedComplexParam(rawParam: string): string | null {
  if (!slugStyleEnabled()) return null;
  let param: string;
  try {
    param = decodeURIComponent(rawParam);
  } catch {
    return null; // 깨진 인코딩 — 페이지가 404 로 처리
  }
  if (!param || param.startsWith(KAPT_PREFIX)) return null;
  const pureId = pureIdFromParam(param);
  const names = decodeNameIdSafe(pureId);
  if (!names) return null; // name-id 가 아니면 손대지 않는다
  const expected = decoratedParam(names.region, names.name, pureId);
  return expected === param ? null : expected;
}
