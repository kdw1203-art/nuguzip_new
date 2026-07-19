import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { createMarketRequest, listMarketRequests } from "@/lib/market/store-db";

export const runtime = "nodejs";

export async function GET() {
  const requests = await listMarketRequests();
  return NextResponse.json({ requests });
}

export async function POST(req: Request) {
  const session = await safeAuth();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const requestType = String(body.requestType ?? "").trim();
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const city = String(body.city ?? "").trim();
  const district = String(body.district ?? "").trim();
  const dueDate = String(body.dueDate ?? "").trim();
  const budgetMin =
    body.budgetMin === "" || body.budgetMin == null ? null : Number(body.budgetMin);
  const budgetMax =
    body.budgetMax === "" || body.budgetMax == null ? null : Number(body.budgetMax);
  const relatedSite = String(body.relatedSite ?? "").trim() || undefined;

  if (!requestType) {
    return NextResponse.json({ error: "의뢰 유형을 선택해 주세요." }, { status: 400 });
  }
  if (!title || title.length < 2) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!description || description.length < 5) {
    return NextResponse.json({ error: "상세 설명을 입력해 주세요." }, { status: 400 });
  }
  if (!district || !dueDate) {
    return NextResponse.json(
      { error: "지역·납기 희망일을 입력해 주세요." },
      { status: 400 },
    );
  }

  const requesterLabel = session?.user
    ? (session.user.name?.trim() || session.user.email?.split("@")[0]?.trim() || "회원")
    : String(body.requesterLabel ?? "").trim() || "게스트";
  const requesterEmail = session?.user?.email ?? undefined;

  try {
    const request = await createMarketRequest({
      requesterEmail,
      requesterLabel,
      title,
      description,
      requestType,
      city: city || "서울특별시",
      district,
      budgetMin: Number.isFinite(budgetMin as number) ? budgetMin : null,
      budgetMax: Number.isFinite(budgetMax as number) ? budgetMax : null,
      dueDate,
      relatedSite,
    });
    return NextResponse.json({ request }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "생성 실패" },
      { status: 500 },
    );
  }
}
