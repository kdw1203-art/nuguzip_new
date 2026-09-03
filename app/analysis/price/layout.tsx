/* [958] 예전 "AI 제안가 예시 · 데모용 · noIndex" 메타는 이 페이지가 실거래 도구가 된
   뒤에도 남아 있던 거짓말이었다(page.tsx 메타가 런타임에 이기지만 레이아웃이 "가짜"라고
   적혀 있는 상태). 레이아웃은 메타를 갖지 않는다 — page.tsx 가 단일 출처다. */
export default function PriceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
