/**
 * 전문가 유형별 공식 출처 검증 링크.
 *
 * [953] 정의는 lib/experts/taxonomy.ts(EXPERT_TYPES[].source) 한 곳으로 옮겼다 —
 * 신청 폼이 받는 유형과 검증 출처가 어긋나던 문제(감정평가사·대출상담사는 신청은
 * 받는데 출처가 없고, 건축사는 출처만 있고 신청 폼에 없었다)를 없앤다.
 * 이 파일은 운영 큐·정책 페이지가 쓰던 모양(ExpertVerificationSource)을 유지하는
 * 어댑터다.
 */
import { EXPERT_TYPES } from "./taxonomy";

export type ExpertVerificationSource = {
  expertTypes: string[];
  label: string;
  authority: string;
  verificationUrl: string;
  searchHint: string;
};

export const EXPERT_VERIFICATION_SOURCES: ExpertVerificationSource[] = EXPERT_TYPES.flatMap(
  (t) =>
    t.source
      ? [
          {
            expertTypes: [t.label],
            label: t.source.label,
            authority: t.source.authority,
            verificationUrl: t.source.verificationUrl,
            searchHint: t.source.searchHint,
          },
        ]
      : [],
);

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
