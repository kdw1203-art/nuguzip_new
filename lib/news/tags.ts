/* [#103] 뉴스 태그 허브 — 큐레이션 태그(SSOT).
 * 자동 수집 뉴스 722건의 제목·분류에서 실제로 반복되는 주제만 고른다(빈 허브 방지).
 * 추가는 뒤에만 — slug 가 URL 이므로 재정렬·수정은 기존 URL 을 깬다. */

export type NewsTag = {
  slug: string;
  label: string;
  /** 제목·분류 매칭 키워드 (label 외 동의어) */
  match: string[];
};

export const NEWS_TAGS: NewsTag[] = [
  { slug: "jaegeonchug", label: "재건축", match: ["재건축", "재초환", "초과이익"] },
  { slug: "jaegaebal", label: "재개발", match: ["재개발", "정비사업", "정비구역"] },
  { slug: "cheongyag", label: "청약", match: ["청약", "분양가", "특별공급", "가점"] },
  { slug: "jeonse", label: "전세", match: ["전세", "전세가", "역전세", "보증금"] },
  { slug: "wolse", label: "월세", match: ["월세", "임대료"] },
  { slug: "geumri", label: "금리·대출", match: ["금리", "대출", "주담대", "LTV", "DSR", "디딤돌"] },
  { slug: "gyuje", label: "규제·정책", match: ["규제", "대책", "정책", "국토부", "국토교통부", "토지거래"] },
  { slug: "gonggeub", label: "공급·입주", match: ["공급", "입주", "착공", "인허가", "물량"] },
  { slug: "bunyang", label: "분양", match: ["분양", "미분양", "완판"] },
  { slug: "gtx", label: "GTX·교통", match: ["GTX", "지하철", "노선", "개통", "철도"] },
  { slug: "segeum", label: "세금", match: ["종부세", "취득세", "양도세", "보유세", "재산세"] },
  { slug: "imdaecha", label: "임대차", match: ["임대차", "갱신", "계약갱신", "임대인", "임차인"] },
  { slug: "jeonse-sagi", label: "전세사기", match: ["전세사기", "깡통", "HUG", "보증사고"] },
  { slug: "sindosi", label: "신도시·택지", match: ["신도시", "택지", "3기", "그린벨트"] },
  { slug: "remodeling", label: "리모델링", match: ["리모델링"] },
  { slug: "gangnam", label: "강남권", match: ["강남", "서초", "송파", "잠실", "압구정", "반포"] },
  { slug: "hangang", label: "한강벨트", match: ["한강", "용산", "성수", "여의도", "마포"] },
  { slug: "gyeonggi", label: "경기·수도권", match: ["경기", "수도권", "과천", "분당", "판교", "광명", "하남"] },
  { slug: "silgeorae", label: "실거래·시세", match: ["실거래", "신고가", "시세", "매매가", "집값", "아파트값"] },
  { slug: "gyeongmae", label: "경매·공매", match: ["경매", "공매", "낙찰"] },
];

export function findNewsTag(slug: string): NewsTag | undefined {
  return NEWS_TAGS.find((t) => t.slug === slug);
}

export function postMatchesTag(
  tag: NewsTag,
  post: { title: string; category?: string | null; tags?: string[] },
): boolean {
  const hay = `${post.title} ${post.category ?? ""} ${(post.tags ?? []).join(" ")}`;
  return tag.match.some((m) => hay.includes(m));
}
