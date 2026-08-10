import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { incrementDealView } from "@/lib/dev-deals/store";

/* 조회수 +1 (best-effort) — 원래 상세 페이지가 렌더 중에 직접 올렸다.
   페이지를 ISR 로 바꾸면서(2026-08-10 비용 감축) 렌더 중 쓰기를 떼어 이 핑으로
   옮겼다. 캐시된 렌더에서는 쓰기가 실행되지 않아 조회수가 조용히 멎기 때문이다.
   의미 변화를 기록해 둔다: JS 를 안 돌리는 크롤러의 열람은 이제 집계되지 않는다
   — 사람 조회에 더 가까운 수가 된다. 실패해도 페이지에는 영향이 없다. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || id.length > 100) {
    return NextResponse.json({ error: "잘못된 id" }, { status: 400 });
  }
  await incrementDealView(id); // 내부에서 실패를 logger.warn 으로 삼킨다 (기존과 동일)
  return NextResponse.json({ ok: true });
}
