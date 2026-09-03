import { getBusinessInfo } from "@/lib/brand/business-info";

/**
 * N18 — 언론 인용용 요약 블록.
 *
 * 기자가 기사에 쓰려면 (1) 그대로 복사할 수 있는 완결 문장, (2) 출처 표기 문구,
 * (3) 확인 전화를 걸 데이터 문의처가 한자리에 있어야 한다. 셋 중 하나라도
 * 없으면 대개 인용 대신 "업계에 따르면"으로 흘러간다.
 *
 * sentences 는 호출부가 **실측 집계로 조립한 완결 문장**이어야 한다.
 * 이 컴포넌트는 수치를 만들지 않는다 — 배치와 표기만 담당한다.
 * (CitationBlock 과 역할이 다르다: 저쪽은 한 문장짜리 인용 규격, 이쪽은
 *  기사 리드로 쓸 수 있는 문단 + 문의처.)
 */
export function PressSummaryBlock({
  sentences,
  asOfLabel,
  provisional = false,
}: {
  sentences: string[];
  /** "2026년 6월 기준" 처럼 기준 시점을 밝히는 라벨 */
  asOfLabel: string;
  /** 신고 지연으로 수치가 더 늘 수 있는 기간인지 */
  provisional?: boolean;
}) {
  const clean = sentences.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const info = getBusinessInfo();

  return (
    <section className="card mb-6 p-[var(--pad-card)]">
      <h2 className="text-[13px] font-extrabold text-ink">언론 인용용 요약</h2>
      <p className="mt-1 text-[11px] leading-[1.6] text-text-3">
        기사·리포트에 그대로 옮겨 쓰실 수 있도록 정리했습니다 · {asOfLabel}
      </p>

      <blockquote className="mt-3 rounded-[10px] border-l-[3px] border-primary bg-bg px-4 py-3 text-[13px] leading-[1.8] text-text-1">
        {clean.map((s, i) => (
          <span key={i}>
            {s}
            {i < clean.length - 1 ? " " : ""}
          </span>
        ))}
      </blockquote>

      <dl className="mt-3 grid grid-cols-1 gap-1.5 text-[12px] leading-[1.6] sm:grid-cols-[88px_minmax(0,1fr)]">
        <dt className="font-bold text-text-2">출처 표기</dt>
        <dd className="text-text-1">내집나우(naezipnow.com), 국토교통부 실거래 신고 기반 자체 집계</dd>
        <dt className="font-bold text-text-2">집계 방법</dt>
        <dd className="text-text-1">
          <a href="/methodology" className="font-bold text-primary underline">
            naezipnow.com/methodology
          </a>{" "}
          에 공개 (해제 신고분 제외 · 면적 미가중 단순 평균)
        </dd>
        <dt className="font-bold text-text-2">데이터 문의</dt>
        <dd className="text-text-1">
          <a href={`mailto:${info.supportEmail}`} className="font-bold text-primary underline">
            {info.supportEmail}
          </a>{" "}
          · 원자료 확인·추가 집계 요청을 받습니다
        </dd>
      </dl>

      <p className="mt-3 text-[11px] leading-[1.6] text-text-3">
        {provisional
          ? "이 달은 실거래 신고 기한(계약 후 30일)이 지나지 않아 잠정치입니다 — 인용 시 “잠정”을 함께 밝혀 주세요. "
          : ""}
        평균가는 면적·타입을 가중하지 않은 단순 평균이라, 그 달의 거래 면적 구성에
        따라 달라집니다. “시세”와 같은 의미로 쓰지 말아 주세요.
      </p>
    </section>
  );
}
