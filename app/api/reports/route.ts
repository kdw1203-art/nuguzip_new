import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { createReport, listReports, toPublicReport } from "@/lib/reports/store-db";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";

export async function GET() {
  /* listReports 가 실패를 던지게 바뀌었다. 여기서 다시 빈 배열로 접으면
     "리포트가 없다"는 없는 사실이 API 밖으로 나간다 — 못 읽었으면 못 읽었다고
     한다. */
  try {
    /* 이 GET 은 인증이 없다. author_id 가 이메일이 된 뒤로(20260806154632)
       UserReport 를 그대로 실으면 크리에이터 이메일이 그대로 나간다. */
    const items = (await listReports()).map(toPublicReport);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json(
      { error: "리포트 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (!body.title || !body.category) {
    return NextResponse.json(
      { error: "제목과 카테고리는 필수입니다." },
      { status: 400 },
    );
  }
  try {
    const report = await createReport({
      title: String(body.title),
      subtitle: body.subtitle ? String(body.subtitle) : undefined,
      category: String(body.category),
      region: body.region ? String(body.region) : undefined,
      price: Number(body.price ?? 0),
      tags: Array.isArray(body.tags)
        ? (body.tags as unknown[]).map(String)
        : [],
      tableOfContents: Array.isArray(body.tableOfContents)
        ? (body.tableOfContents as unknown[]).map(String)
        : [],
      previewContent: body.previewContent ? String(body.previewContent) : undefined,
      pages: Number(body.pages ?? 10),
      isPremium: Boolean(body.isPremium),
      /* authorEmail 을 안 넘기고 있었다. 그래서 이 경로로 만든 리포트는
         주인이 없었고(author_id=null), 만든 사람 본인도 수정·삭제가 안 됐다. */
      authorEmail: session.user.email,
      /* 이름이 없으면 **아무것도 안 넘긴다.** 예전엔 `name ?? email` 이었고
         createReport 가 마스킹해 주긴 했지만, 마스킹은 저장소 쪽 사정이라
         호출부가 기대면 안 된다 — 다음 호출부는 마스킹 안 하는 저장소를 쓴다.
         출력은 같다: safePublicAuthorLabel(undefined, email) 도
         safePublicAuthorLabel(email, email) 도 "kdw***" 이다. */
      authorLabel: session.user.name?.trim() || undefined,
    });
    return NextResponse.json({ report: toPublicReport(report) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "생성 실패" },
      { status: 500 },
    );
  }
}
