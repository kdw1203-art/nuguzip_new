import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageExpertProfile, sanitizeExpertForPublic } from "@/lib/experts/access";
import { deleteExpert, getExpert, updateExpert } from "@/lib/experts/store-db";
import { sanitizeExpertProfilePatch } from "@/lib/experts/profile-input";
import { revalidatePath } from "next/cache";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const expert = await getExpert(id);
  if (!expert) return NextResponse.json({ error: "없음" }, { status: 404 });
  return NextResponse.json({ expert: sanitizeExpertForPublic(expert) });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const prev = await getExpert(id);
  if (!prev) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (!(await canManageExpertProfile(session, prev))) {
    return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  /* [953] 값 검증 — 예전엔 원본 body 가 그대로 스토어로 갔다(컬럼만 걸렀다). */
  const { patch, errors } = sanitizeExpertProfilePatch(body);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }
  const updated = await updateExpert(id, patch);
  if (!updated) return NextResponse.json({ error: "없음" }, { status: 404 });
  /* 목록·상세는 ISR(300s) — 본인이 저장한 값이 5분 뒤에 보이면 "저장 안 됐다"고 읽는다. */
  revalidatePath("/town/experts");
  revalidatePath(`/town/experts/${id}`);
  return NextResponse.json({ expert: sanitizeExpertForPublic(updated) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const prev = await getExpert(id);
  if (!prev) return NextResponse.json({ error: "없음" }, { status: 404 });
  if (!(await canManageExpertProfile(session, prev))) {
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
  }
  await deleteExpert(id);
  return NextResponse.json({ ok: true });
}
