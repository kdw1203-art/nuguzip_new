/**
 * 전문가 유형별 공식 출처 검증 링크.
 * `DATA_SOURCE_REGISTRY` 와 동일한 협회 URL을 UI·운영 큐에 노출합니다.
 */

export type ExpertVerificationSource = {
  expertTypes: string[];
  label: string;
  authority: string;
  verificationUrl: string;
  searchHint: string;
};

export const EXPERT_VERIFICATION_SOURCES: ExpertVerificationSource[] = [
  {
    expertTypes: ["공인중개사"],
    label: "한국공인중개사협회",
    authority: "KAR / V-World",
    verificationUrl: "https://www.kar.or.kr",
    searchHint: "개설 등록번호·중개사명으로 등록 상태 확인",
  },
  {
    expertTypes: ["법무사·변호사"],
    label: "대한변호사협회",
    authority: "대한변협",
    verificationUrl: "https://www.koreanbar.or.kr",
    searchHint: "변호사 등록번호·성명 검색",
  },
  {
    expertTypes: ["법무사·변호사"],
    label: "대한법무사협회",
    authority: "대법무사협",
    verificationUrl: "https://www.kscj.or.kr",
    searchHint: "법무사 등록번호 검색",
  },
  {
    expertTypes: ["세무사"],
    label: "한국세무사회",
    authority: "KACPTA",
    verificationUrl: "https://www.kacpta.or.kr",
    searchHint: "세무사 등록번호·성명 검색",
  },
  {
    expertTypes: ["건축사"],
    label: "대한건축사협회",
    authority: "KIRA",
    verificationUrl: "https://www.kira.or.kr",
    searchHint: "건축사 등록·사무소 검색",
  },
];

export function sourcesForExpertType(expertType: string): ExpertVerificationSource[] {
  const t = expertType.trim();
  return EXPERT_VERIFICATION_SOURCES.filter((s) =>
    s.expertTypes.some((et) => t.includes(et) || et.includes(t)),
  );
}

export function primarySourceForExpertType(
  expertType: string,
): ExpertVerificationSource | null {
  return sourcesForExpertType(expertType)[0] ?? null;
}
