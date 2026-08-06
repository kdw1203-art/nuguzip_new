import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { createReport, listReports } from "@/lib/reports/store-db";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";

export async function GET() {
  /* listReports 가 실패를 던지게 바뀌었다. 여기서 다시 빈 배열로 접으면
     "리포트가 없다"는 없는 사실이 API 밖으로 나간다 — 못 읽었으면 못 읽었다고
     한다. */
  try {
    const items = await listReports();
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
      authorLabel: session.user.name ?? session.user.email,
    });
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "생성 실패" },
      { status: 500 },
    );
  }
}
