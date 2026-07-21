/** 구조화 데이터(JSON-LD) 삽입 헬퍼 — schema.org 리치 검색 결과용.
 *  서버/클라이언트 어디서든 사용 가능(순수 렌더). data 는 유효한 JSON 직렬화 객체. */
export function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify 결과만 주입 — XSS 방지 위해 '<' 이스케이프
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
