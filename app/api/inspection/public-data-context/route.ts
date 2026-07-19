import { NextResponse } from "next/server";
import {
  getInspectionPublicContext,
  parseDistrict,
  type InspectionIntent,
} from "@/lib/inspection/public-data-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const district = parseDistrict(
    searchParams.get("district") ?? searchParams.get("region") ?? "",
  );
  if (!district) {
    return NextResponse.json({ error: "district or region required" }, { status: 400 });
  }
  const aptName = searchParams.get("aptName")?.trim() || undefined;
  const intentRaw = searchParams.get("intent");
  const intent = (["실거주", "투자", "전월세", "정비사업"].includes(intentRaw ?? "")
    ? intentRaw
    : "실거주") as InspectionIntent;

  const ctx = await getInspectionPublicContext({ district, aptName, intent });
  return NextResponse.json(ctx);
}
