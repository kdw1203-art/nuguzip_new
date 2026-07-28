import { redirect } from "next/navigation";

/* ============================================================
   /town/market — 얇은 리다이렉트 스텁.

   마켓 화면 자체는 자료(#8)로 개편·통합돼 `/town/library` 가 됐다. 이 경로는
   기존 링크(홈·임장노트 상세·푸시 알림)를 깨지 않으려고 남겨 둔 것이다.

   ── 목적지를 /town/library 에서 /town/groups 로 바꾼 이유 ──────────────────
   `lib/navigation/categories.ts` 의 "모임" 카테고리(groups·전문가·자료실)가
   대표 진입 경로로 이 URL 을 쓴다. 데스크탑 헤더와 푸터의 "모임" 링크가 그것이다.
   그런데 여기서 `/town/library` 로 보내면, /town/library 는 **동네이야기**
   카테고리에 속한 경로라(같은 파일의 match 배열) 다음이 벌어졌다:

     "모임" 클릭 → /town/library 도착 → 헤더는 "동네이야기"를 강조 →
     모임 탭줄(모임·마켓·자료실)이 통째로 사라짐

   즉 "모임" 은 눌러도 모임 화면에 닿지 못하는, 자기 카테고리 밖으로만 나가는
   링크였다. 모임 카테고리에 실제로 속한 화면 중 대표는 임장 모임 목록이므로
   그리로 보낸다 — 이제 클릭하면 카테고리 강조와 탭줄이 살아 있다.

   쿼리는 그대로 넘긴다. 푸시 알림이 `?source=push&campaign=meeting` 을 달고
   들어오는데, 예전 리다이렉트는 이걸 통째로 버려서 유입 경로 집계가 끊겼다.

   자료·리포트를 가리키던 링크는 이 경유지를 쓰지 말고 `/town/library` 를 직접
   가리킨다(app/town/experts/ExpertCard.tsx 에서 그렇게 고쳤다).
   ============================================================ */
/* 이 경로는 화면을 그리지 않고 곧바로 /town/groups 로 보낸다. 색인될 본문이
   없으므로 canonical 을 붙일 대상도 없다 — 색인에서 빼되 링크는 따라가게 둔다. */
export const metadata = {
  robots: { index: false, follow: true },
};

export default async function TownMarketRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value)) for (const v of value) qs.append(key, v);
  }
  const query = qs.toString();
  redirect(query ? `/town/groups?${query}` : "/town/groups");
}
