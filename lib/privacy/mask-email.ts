/**
 * 이메일 마스킹·정규화 — 공개로 나가는 값을 만드는 쪽만 여기 둔다.
 *
 * ── 왜 생겼나 ────────────────────────────────────────────────────────────
 * reports.author_id 를 uuid → text 로 바꾸면서(20260806154632) 그 컬럼에 진짜
 * 이메일이 들어가기 시작했다. 컬럼 GRANT 로 author_id 는 가렸지만, **바로 옆
 * author_label 은 anon 이 읽는 공개 컬럼**이고 호출부들이 거기에
 * `session.user.name ?? session.user.email` 을 넣고 있었다. 이름 없는 계정이면
 * 이메일이 그대로 공개된다 — 한쪽을 가려 놓고 옆 컬럼으로 같은 값이 나가면
 * 아무것도 가린 게 아니다. 그 구멍을 막으려고 만든 파일이다.
 *
 * ── 여기 없는 것 (2026-08-06 전수 census) ────────────────────────────────
 * 저장소에 마스킹 함수가 **9개** 흩어져 있다. 이름만 세면 3개지만 실제로 세면
 * 이렇다. 이름 대조는 과대계상하고, 이름이 다르다고 다른 함수인 것도 아니다.
 *
 *   A) "○○** 이웃" — 5곳, **출력이 전부 같다** (`label ?? local2 + "** 이웃"`)
 *      app/town/shared.tsx:97 maskNoteAuthor(label, email)   ← 가장 일반형
 *      app/notes/page.tsx:42 maskAuthor(note)                = A(n.authorLabel, n.authorEmail)
 *      app/notes/best/[ym]/page.tsx:38 maskAuthor(note)      = 위와 동일
 *      app/api/me/follows/feed/route.ts:26 maskAuthor(note)  = 위와 동일
 *      app/api/complex-reviews/route.ts:12 maskAuthor(email) = A(null, email)
 *   B) "kd***@domain" — 2곳, **폴백만 다른 게 아니다**
 *      app/admin/payments/page.tsx:62 (null→"—", @없음→"***", split("@"))
 *      app/invite/[code]/page.tsx:93  (@없음→"친구", indexOf)
 *   C) "kdw***" — 1곳, lib/qna/store.ts:49 (= 아래 maskEmailPublic)
 *
 * ── 위 census 를 실측한 결과 (/tmp/mask/verify.mjs) ───────────────────────
 * 파일에서 함수 본문을 그대로 잘라 내 돌렸다. 옮겨 적으면 옮긴 걸 검증하는
 * 셈이라 뜻이 없다. 이메일 12 × 라벨 8 조합.
 *   · [A] 300회 대조 — 불일치 0. 5개 구현은 정말로 출력이 같다.
 *   · [C] 12회 대조 — 불일치 0. qna 와 maskEmailPublic 은 같은 함수다.
 *   · [B] 12개 표본 중 **5개**가 갈렸다. 여기 "본체가 갈리는 입력은 a@b@c
 *     하나"라고 적어 뒀었는데 틀렸다 — 실제로는 이렇다:
 *        ""          → admin "—"            / invite "친구"
 *        "  "        → admin "***"          / invite "친구"
 *        "noat"      → admin "***"          / invite "친구"
 *        "@gmail.com"→ admin "***@gmail.com"/ invite "친구"
 *        "a@b@c.com" → admin "a***@b"       / invite "a***@b@c.com"
 *     B 를 합치는 건 "한 입력만 바뀐다"가 아니라 **빈 값·@없음·이중@ 네 갈래를
 *     전부 정하는 일**이다. 세어 본 것과 재 본 것은 다른 말이다.
 *   · 검사기가 실제로 잡는지 먼저 확인했다: A·C 각각에 slice 길이를 한 글자
 *     바꾼 가짜 구현을 넣어 4개 입력에서 잡히는 걸 보고 나서 0을 읽었다.
 *
 * A 5개를 하나로 합치는 건 출력이 같으니 안전하고 값어치도 있지만, 화면 5곳을
 * 건드리는 별개의 변경이다. author_id 타입 수정 커밋에 묻어 들어가면 아무도
 * 검토하지 않은 채 화면이 바뀐다. 그래서 **여기서는 합치지 않고 세어만 뒀다.**
 */

/**
 * 공개 화면용 — local-part 앞 3글자만 남기고 도메인은 통째로 지운다.
 * 예: "kdw1203@gmail.com" → "kdw***". 값이 없으면 "익명".
 *
 * (lib/qna/store.ts 의 구현과 글자 단위로 같다. 옮겨 적은 게 아니라 같은 정책이다.)
 */
export function maskEmailPublic(email: string | null | undefined): string {
  const raw = (email ?? "").trim();
  if (!raw) return "익명";
  const at = raw.indexOf("@");
  const local = at > 0 ? raw.slice(0, at) : raw;
  if (!local) return "익명";
  return `${local.slice(0, 3)}***`;
}

/**
 * 표시명이 이메일 주소 모양인가.
 *
 * 판정은 `local@domain.tld` 한 가지로만 한다. 이름에 @ 가 들어가는 경우가 아주
 * 없진 않은데(`김@철수`) 그건 이 모양이 아니라 안 걸린다 — 넓게 잡아 멀쩡한
 * 별명까지 가리는 것보다, 주소 모양만 정확히 잡는 편이 낫다.
 *
 * 저장 직전(safePublicAuthorLabel)과 화면 직전(예전 행 방어) 두 군데서 같은
 * 판정을 써야 해서 밖으로 뺐다. 정규식이 두 벌이면 언젠가 한 벌만 고친다.
 */
export function looksLikeEmail(value: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value ?? "").trim());
}

/**
 * 공개 컬럼에 저장할 작성자 표시명 — 이메일이 새지 않게 막는 마지막 관문.
 *
 * 표시명이 비면 이메일을 마스킹해 쓰고, 표시명 자체가 이메일 모양이면 그것도
 * 마스킹한다(판정은 looksLikeEmail).
 *
 * 저장 직전에 부르는 게 핵심이다. 화면에서 가리는 방식은 저장된 값을 읽는
 * 경로가 하나만 늘어도 새는데, 아예 안 들어가면 샐 값이 없다.
 */
export function safePublicAuthorLabel(
  label: string | null | undefined,
  fallbackEmail?: string | null,
): string | null {
  const raw = (label ?? "").trim();
  if (!raw) {
    const fb = (fallbackEmail ?? "").trim();
    return fb ? maskEmailPublic(fb) : null;
  }
  if (looksLikeEmail(raw)) return maskEmailPublic(raw);
  return raw;
}

/**
 * 이메일 정규화 — 앞뒤 공백 제거 + 소문자, 비면 `null`.
 *
 * 이름이 `normEmail` 이 아닌 이유: 저장소에 이미 `normEmail` 이 **7개** 있고
 * (lib/notifications/region-alerts.ts · notifications/inbox.ts ·
 *  saved-search/store.ts · onboarding/personalization.ts · alerts/subscriptions.ts ·
 *  reengagement/candidates.ts · listings/staleness.ts) 전부 빈 값에 `""` 를
 * 돌려준다. 이건 `null` 을 돌려준다 — 소유자 필터에 빈 문자열이 들어가
 * `author_id = ''` 로 조회되는 걸 타입으로 막으려는 것이다. 같은 이름을 쓰면
 * 나중에 읽는 사람이 서로 바꿔 써도 되는 줄 안다.
 */
export function normEmailOrNull(email: string | null | undefined): string | null {
  const v = (email ?? "").trim().toLowerCase();
  return v.length > 0 ? v : null;
}
