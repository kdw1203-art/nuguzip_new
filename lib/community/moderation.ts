/**
 * 커뮤니티 금칙어 필터 — 정규화 기반 매칭.
 *
 * [2026-08-14 실질화] 이전 판은 6개 단어의 단순 substring 매칭이었다(제품 리뷰
 * 실측). "도 박"처럼 띄어 쓰거나 "도.박"처럼 기호를 끼우면 그대로 통과했고,
 * 실운영 스팸이 정확히 그렇게 들어온다. 이 판은:
 *
 *  1) **정규화 후 대조** — 공백·구두점·기호·제로폭 문자를 걷어낸 문자열에서
 *     찾는다. "도 박", "도.박", "도​박(제로폭)" 모두 "도박"으로 접힌다.
 *  2) **기본 목록 확장** — 불법 광고·사기 유도에 실제로 쓰이는 표현 위주.
 *     운영 중 발견되는 변형은 COMMUNITY_BANNED_WORDS env 로 즉시 추가한다
 *     (env 설정 시 기본 목록을 대체가 아니라 **합집합**으로 쓴다 — 이전 판은
 *     env 가 기본 목록을 통째로 대체해서, env 에 한 단어만 넣으면 나머지
 *     기본 차단이 전부 풀리는 함정이 있었다).
 *  3) **검사기 게이트** — scripts/check-moderation-filter.mjs 가 우회 표기
 *     케이스를 실제로 잡는지 빌드 전에 실증한다(잡는 걸 확인 안 한 필터는
 *     없는 필터다).
 *
 * 한계(정직하게): 초성 우회("ㄷㅂ")와 발음 유사 변형("돜밬")은 아직 못 잡는다.
 * 이것까지 가려면 형태소·자모 분해 매칭이 필요하다 — 신고(content_reports)와
 * 관리자 큐가 그 구멍을 사람 손으로 메운다.
 */

const DEFAULT_BANNED_WORDS = [
  // 이전 판 6종 유지
  "욕설",
  "혐오",
  "불법",
  "도박",
  "마약",
  "성매매",
  // 불법 광고·사기 유도 확장 (2026-08-14)
  "카지노",
  "바카라",
  "토토",
  "슬롯머신",
  "사설토토",
  "먹튀",
  "대포통장",
  "대포폰",
  "조건만남",
  "출장안마",
  "성인용품",
  "리딩방",
  "작업대출",
  "휴대폰깡",
  "소액결제현금화",
  "정보이용료현금화",
  "댓글알바",
  "총판모집",
];

/**
 * 매칭용 정규화 — 소문자화 후 한글·영문·숫자만 남긴다.
 * 공백·구두점·이모지·제로폭 문자를 끼워 넣는 우회를 접는다.
 */
export function normalizeForModeration(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC") // 전각 → 반각, 호환 자모 정규화
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
}

function bannedWords(): string[] {
  const base = DEFAULT_BANNED_WORDS;
  const env = process.env.COMMUNITY_BANNED_WORDS?.trim();
  if (!env) return base;
  const extra = env
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  // 합집합 — env 는 추가 수단이지 기본 차단을 끄는 스위치가 아니다.
  return [...new Set([...base, ...extra])];
}

export function findBlockedWord(text: string): string | null {
  const normalized = normalizeForModeration(text);
  for (const w of bannedWords()) {
    const needle = normalizeForModeration(w);
    if (needle && normalized.includes(needle)) return w;
  }
  return null;
}
