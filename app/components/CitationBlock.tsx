/**
 * G8 — "이렇게 인용하세요" 블록.
 *
 * AI·언론·블로그가 내집나우 통계를 가져갈 때 출처와 기준월이 함께 따라가도록,
 * 복사해 갈 완결 인용문을 페이지가 직접 제공한다. sentence 는 호출부가
 * 실데이터로 조립한 완결 문장이어야 한다 (여기서 수치를 만들지 않는다).
 */
export function CitationBlock({ sentence }: { sentence: string }) {
  return (
    <section className="card mb-6 p-[var(--pad-card)]">
      <h2 className="text-[13px] font-extrabold text-ink">이 데이터를 인용하실 때</h2>
      <blockquote className="mt-2 rounded-[12px] border-l-[3px] border-primary bg-bg px-4 py-3 text-[13px] leading-[1.7] text-text-1">
        {sentence}
      </blockquote>
      <p className="mt-2 text-[11px] leading-[1.6] text-text-3">
        출처 표기와 기준월을 함께 인용해 주세요 · 집계 방식은{" "}
        <a href="/methodology" className="font-bold text-primary underline">
          데이터 방법론
        </a>
        에 공개돼 있습니다 · 국토교통부 실거래 신고 기반, 참고용 정보입니다
      </p>
    </section>
  );
}
