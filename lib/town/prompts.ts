/* [#63] 오늘의 동네 글감 — 단일 출처.
 * 카드(/town)·글쓰기 태깅(/api/community/posts)·질문 스레드(/town/prompt/[idx])가
 * 전부 이 배열 하나를 본다. 항목 순서를 바꾸면 기존 태그(글감#idx)와 어긋나므로
 * **추가는 뒤에만, 삭제·재정렬 금지** — 스레드 태그가 인덱스 기반이다.
 * 순수 모듈(서버·클라 겸용) — server-only 를 두지 않는다. */

export const TOWN_PROMPTS: string[] = [
  "우리 동네에서 요즘 공사 중인 곳, 어디가 제일 궁금하세요?",
  "이사 오고 나서야 알게 된 우리 동네 장단점 하나씩만 알려주세요",
  "우리 동네 전세 시세, 체감상 오르고 있나요 내리고 있나요?",
  "동네 중개사무소 다녀오신 분 — 최근 분위기 어땠나요?",
  "아이 키우기엔 우리 동네 어떤가요? 학교·학원 이야기 환영",
  "우리 동네에서 밤 산책하기 좋은 코스 추천해 주세요",
  "재건축·재개발 소문, 우리 동네에도 있나요? 들은 이야기 공유해요",
  "출퇴근 교통 솔직 후기 — 지하철·버스·주차 어디가 제일 아쉽나요?",
  "우리 동네 신축 vs 구축, 실거주 만족도는 어느 쪽이 높을까요?",
  "관리비 이야기 — 우리 단지 관리비, 적정하다고 느끼시나요?",
  "동네 상권 변화 — 최근 새로 생긴 가게, 없어진 가게 있나요?",
  "이 동네로 이사 올 친구에게 딱 한 가지 조언한다면?",
  "우리 동네 소음·치안, 실제로 살아 보니 어떤가요?",
  "장 보러 어디 가세요? 동네 마트·시장 가성비 비교해요",
];

export function kstDayIndex(): number {
  const kst = new Date(Date.now() + 9 * 3600_000);
  return Math.floor(kst.getTime() / 86_400_000);
}

export function todayPromptIndex(): number {
  return kstDayIndex() % TOWN_PROMPTS.length;
}

/** 글감 태그 — posts.tags 에 저장되는 형식. */
export function promptTag(index: number): string {
  return `글감#${index}`;
}

export function parsePromptIndex(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n >= TOWN_PROMPTS.length) return null;
  return n;
}
