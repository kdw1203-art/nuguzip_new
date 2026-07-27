/**
 * 단지 Q&A 세부 카테고리(주제).
 *
 * 왜 필요한가:
 *   /qna 는 그동안 "최근 질문" 한 줄로만 쌓였다. 다른 카테고리(임장 모임·자료·
 *   뉴스·공매·청약)는 전부 안에서 다시 갈라 보는 축이 있는데 Q&A 만 없었다.
 *
 * 어떻게 가르는가 — **지어내지 않는다**:
 *   1순위는 작성자가 직접 붙인 태그다(명시적). 태그로 못 가리면 제목·본문
 *   키워드로 추정한다(휴리스틱). 그래서 이 분류는 "검색 필터"지 "사실 선언"이
 *   아니다 — 질문 카드에 주제 배지를 박아 단정하지 않고, 목록을 좁히는
 *   용도로만 쓴다.
 *
 *   개수는 전부 실제로 불러온 질문에서 센다. 고정 숫자를 박아 두지 않으므로
 *   질문이 0건이면 모든 주제가 0으로 보이고, 그게 정확한 상태다.
 */
import type { QnaQuestion } from "@/lib/qna/types";

export type QnaTopicKey =
  | "redev"
  | "school"
  | "transit"
  | "parking"
  | "noise"
  | "light"
  | "cost"
  | "price"
  | "contract"
  | "amenity";

export type QnaTopic = {
  key: QnaTopicKey;
  label: string;
  icon: string;
  /** 질문 작성 시 보여주는 예시 질문 — 무엇을 물어야 할지 막막한 사람용 */
  hint: string;
  /** 태그·제목·본문에서 찾는 말. 전부 소문자·공백제거 후 비교한다. */
  keywords: string[];
};

export const QNA_TOPICS: QnaTopic[] = [
  {
    key: "redev",
    label: "재건축·재개발",
    icon: "🏗️",
    hint: "조합 설립은 어디까지 진행됐나요?",
    keywords: ["재건축", "재개발", "정비사업", "조합", "리모델링", "안전진단", "분담금"],
  },
  {
    key: "school",
    label: "학군·교육",
    icon: "🎓",
    hint: "초등학교 배정과 통학로가 궁금해요",
    keywords: ["학군", "학교", "초등", "중학", "고등", "학원", "통학", "배정"],
  },
  {
    key: "transit",
    label: "교통·출퇴근",
    icon: "🚇",
    hint: "역까지 도보 몇 분이고 출근길은 어떤가요?",
    keywords: ["교통", "지하철", "역세권", "버스", "출퇴근", "통근", "도보", "광역버스"],
  },
  {
    key: "parking",
    label: "주차",
    icon: "🅿️",
    hint: "세대당 주차 대수와 밤 시간 주차 상황이 궁금해요",
    keywords: ["주차", "지상주차", "지하주차", "주차장", "이중주차"],
  },
  {
    key: "noise",
    label: "소음·층간소음",
    icon: "🔊",
    hint: "층간소음이나 도로 소음은 어느 정도인가요?",
    keywords: ["소음", "층간소음", "방음", "시끄", "도로소음", "철도"],
  },
  {
    key: "light",
    label: "채광·향·조망",
    icon: "🌤️",
    hint: "이 동·라인 채광과 조망은 어떤가요?",
    keywords: ["채광", "일조", "향", "조망", "뷰", "남향", "동향", "서향", "북향"],
  },
  {
    key: "cost",
    label: "관리비·유지",
    icon: "💡",
    hint: "관리비는 평형 기준으로 얼마 정도 나오나요?",
    keywords: ["관리비", "난방", "수도", "누수", "하자", "노후", "배관", "결로"],
  },
  {
    key: "price",
    label: "시세·거래",
    icon: "📈",
    hint: "최근 실거래가 흐름을 어떻게 보시나요?",
    keywords: ["시세", "실거래", "호가", "매매", "가격", "급매", "거래량"],
  },
  {
    key: "contract",
    label: "계약·전월세",
    icon: "📄",
    hint: "전세가율과 계약 시 확인할 점이 궁금해요",
    keywords: ["전세", "월세", "임대", "계약", "보증금", "전세가율", "갱신", "특약"],
  },
  {
    key: "amenity",
    label: "생활·편의",
    icon: "🛒",
    hint: "장보기·병원·공원 등 생활 인프라는 어떤가요?",
    keywords: ["마트", "편의", "상권", "병원", "공원", "커뮤니티", "헬스", "카페", "생활"],
  },
];

export const QNA_TOPIC_BY_KEY: Record<string, QnaTopic> = Object.fromEntries(
  QNA_TOPICS.map((t) => [t.key, t]),
);

export function isQnaTopicKey(v: string | null | undefined): v is QnaTopicKey {
  return !!v && v in QNA_TOPIC_BY_KEY;
}

/** 비교용 정규화 — 소문자 + 공백/기호 제거 (태그 "층간 소음" 과 "층간소음" 을 같게 본다) */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s·・.,_/-]+/g, "");
}

/**
 * 질문 1건이 속한 주제들. 하나도 안 걸리면 빈 배열 — 억지로 배정하지 않는다.
 * (한 질문이 여러 주제에 걸리는 건 정상이다. 예: "재건축 분담금과 시세")
 */
export function topicsOf(q: QnaQuestion): QnaTopicKey[] {
  const tagHay = q.tags.map(norm);
  const textHay = norm(`${q.title} ${q.body ?? ""}`);
  const hits: QnaTopicKey[] = [];
  for (const t of QNA_TOPICS) {
    const kws = t.keywords.map(norm);
    // 1순위: 작성자가 직접 붙인 태그 / 2순위: 제목·본문 추정
    const byTag = tagHay.some((tag) => kws.some((k) => tag.includes(k) || k.includes(tag)));
    const byText = kws.some((k) => textHay.includes(k));
    if (byTag || byText) hits.push(t.key);
  }
  return hits;
}

/** 주제별 실제 건수 — 넘겨받은 목록에서만 센다(고정값 없음). */
export function countByTopic(questions: QnaQuestion[]): Record<QnaTopicKey, number> {
  const counts = Object.fromEntries(QNA_TOPICS.map((t) => [t.key, 0])) as Record<
    QnaTopicKey,
    number
  >;
  for (const q of questions) {
    for (const key of topicsOf(q)) counts[key] += 1;
  }
  return counts;
}

/** 주제로 목록 좁히기. key 가 유효하지 않으면 원본 그대로 돌려준다. */
export function filterByTopic(questions: QnaQuestion[], key: string | null): QnaQuestion[] {
  if (!isQnaTopicKey(key)) return questions;
  return questions.filter((q) => topicsOf(q).includes(key));
}
