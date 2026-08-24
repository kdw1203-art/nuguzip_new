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

/** UTF-8 → base64url (Edge 안전 · Buffer 금지). complex-store 의 encodeComplexId 와 동일 출력. */
function utf8ToBase64url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* [OPT · 308 제거] 내부 링크가 base64 순수 id(`/complex/{id}`)를 그대로 쓰면
   미들웨어가 매번 한글 슬러그로 308 리다이렉트한다(실측: 24h 4,736건, 전부 단지 페이지).
   외부 유입(옛 색인)은 어쩔 수 없지만, 우리 링크는 처음부터 정규 슬러그를 내보내
   그 한 홉을 없앤다. 아래 두 헬퍼는 미들웨어와 같은 규칙을 쓰는 순수·클라이언트 안전
   함수라, 서버·클라이언트 어디서든 링크 생성에 바로 쓸 수 있다(DB 조회 0). */

/** 단지 id → 정규 href. 이미 슬러그가 붙었거나 kapt·해석 불가면 안전하게 그대로 둔다(멱등). */
export function complexHrefFromId(id: string): string {
  const raw = (id ?? "").trim();
  if (!raw) return "/complex";
  if (!slugStyleEnabled() || raw.startsWith(KAPT_PREFIX)) {
    return `/complex/${encodeURIComponent(raw)}`;
  }
  const pureId = pureIdFromParam(raw);
  const dec = decodeNameIdSafe(pureId);
  if (!dec) return `/complex/${encodeURIComponent(raw)}`;
  return `/complex/${encodeURIComponent(decoratedParam(dec.region, dec.name, pureId))}`;
}

/** (region, name) → 정규 href. 이름을 아는 목록·표에서 308 없이 바로 링크한다. */
export function complexHrefFromNames(region: string, name: string): string {
  const r = (region ?? "").trim();
  const n = (name ?? "").trim();
  if (!r || !n) return "/complex";
  const pureId = utf8ToBase64url(`${r}${COMPLEX_ID_SEP}${n}`);
  return `/complex/${encodeURIComponent(decoratedParam(r, n, pureId))}`;
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
