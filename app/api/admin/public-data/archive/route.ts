/**
 * POST /api/admin/public-data/archive
 * 관리자 전용. CSV/ZIP/HWPX 공공데이터 아카이브 업로드 → 추출·manifest 갱신.
 *
 * GET — manifest 목록
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import {
  ingestArchiveFile,
  loadArchiveManifest,
} from "@/lib/public-data/adapters/archive-extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ALLOWED_EXT = [".csv", ".zip", ".hwpx"];

export async function GET() {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });
  }
  return NextResponse.json({ entries: loadArchiveManifest() });
}

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

  const lower = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
    return NextResponse.json(
      { error: "지원 형식: .csv, .zip, .hwpx" },
      { status: 400 },
    );
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const entry = ingestArchiveFile(file.name, buffer);
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ingest 실패" },
      { status: 422 },
    );
  }
}
