/**
 * 공개 목록에서 테스트·저품질 콘텐츠를 제외합니다.
 * (예: 'ㄹㄹ' 같은 키보드 테스트, 1~2자 무의미 제목)
 */
export function isLowQualityPublicContent(
  title: string,
  description?: string | null,
): boolean {
  const t = title.trim();
  if (!t || t.length < 2) return true;

  // 동일 문자 반복 (ㄹㄹ, aa, 11 …)
  if (/^(.)\1+$/.test(t)) return true;

  // 한글 자모만 4자 이하
  if (/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(t) && t.length <= 4) return true;

  // 영문/숫자만 2자 이하
  if (/^[a-zA-Z0-9]+$/.test(t) && t.length <= 2) return true;

  const d = (description ?? "").trim();
  if (d && /^(.)\1+$/.test(d) && d.length <= 4) return true;

  return false;
}

export function filterPublicContent<T extends { title: string; description?: string | null }>(
  rows: T[],
): T[] {
  return rows.filter((r) => !isLowQualityPublicContent(r.title, r.description));
}
