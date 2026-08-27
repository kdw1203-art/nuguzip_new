/**
 * [B35·B36] 동네이야기 글 → 지도·임장노트 핸드오프 주소.
 *
 * 글을 읽다가 "여기 어디지" / "나도 가봐야지" 로 넘어갈 때, 지금 보던 **동네를
 * 들고 가야 한다**. 예전에는 목적지가 `/map`·`/notes/new` 고정이라 전국 초기
 * 화면과 빈 폼이 떴다 — 방금 읽어서 알게 된 맥락을 우리가 버리는 셈이었다.
 *
 * 주소 조립을 페이지에서 떼어낸 이유: 지금 DB 의 글은 전부 지역이 비어 있어
 * (자동수집 뉴스) 화면만 봐서는 지역이 실린 경로를 확인할 수 없다. 순수 함수로
 * 두면 두 갈래(지역 있음/없음)를 테스트로 못박을 수 있다.
 *
 * 받는 쪽 계약:
 *  · /map        → app/map/page.tsx 의 regionForFocus = region || … || district
 *  · /notes/new  → NoteForm 이 sp.get("region") 을 위치 프리필로 읽는다
 */
export type TownHandoff = {
  /** "서울 강남구" 처럼 사람이 읽는 지역명. 알 수 없으면 빈 문자열. */
  region: string;
  /** 지역 포커스가 실린 지도 주소 */
  mapHref: string;
  /** 지역이 프리필된 임장노트 작성 주소 */
  noteNewHref: string;
};

export function townHandoff(input: {
  city?: string | null;
  district?: string | null;
}): TownHandoff {
  const city = (input.city ?? "").trim();
  const district = (input.district ?? "").trim();
  const region = [city, district].filter(Boolean).join(" ");

  if (!region) {
    /* 지역을 모르면 **모르는 채로** 보낸다. 억지로 "서울"을 채워 넣으면
       사용자가 고르지 않은 지역을 우리가 고른 것이 된다. */
    return { region: "", mapHref: "/map", noteNewHref: "/notes/new" };
  }

  const qs = new URLSearchParams({ region });
  /* district 는 지도가 region 해석에 실패했을 때 쓰는 두 번째 단서다.
     시·도만 있는 글(예: "서울")에는 붙이지 않는다 — 없는 단서를 지어내지 않는다. */
  if (district) qs.set("district", district);

  return {
    region,
    mapHref: `/map?${qs.toString()}`,
    noteNewHref: `/notes/new?region=${encodeURIComponent(region)}`,
  };
}
