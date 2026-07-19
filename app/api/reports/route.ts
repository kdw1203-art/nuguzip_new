import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createReport, listReports } from "@/lib/reports/store-db";

export async function GET() {
  const items = await listReports();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
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
