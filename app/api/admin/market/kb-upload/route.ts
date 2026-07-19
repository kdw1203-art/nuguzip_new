/**
 * POST /api/admin/market/kb-upload
 * 관리자 전용. KB 시계열 Excel(.xlsx) 업로드 → market_* 적재.
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { ingestKbWorkbook } from "@/lib/kb/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자만 업로드할 수 있습니다." }, { status: 403 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data 형식이 필요합니다." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx")) {
    return NextResponse.json({ error: "KB .xlsx 시계열 파일만 지원합니다." }, { status: 400 });
  }
  try {
    const buffer = await file.arrayBuffer();
    const result = await ingestKbWorkbook(buffer);
    if (result.skipped) {
      return NextResponse.json(
        { ok: false, message: "지원하지 않는 KB 시계열 형식입니다. (주간/월간 주택 시계열을 올려주세요)" },
        { status: 422 },
      );
    }
    return NextResponse.json({ ...result, fileName: file.name });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "파싱 실패" },
      { status: 500 },
    );
  }
}
