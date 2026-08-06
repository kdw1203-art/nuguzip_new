import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteReport, getReport, toPublicReport, updateReport } from "@/lib/reports/store-db";
import { normEmailOrNull } from "@/lib/privacy/mask-email";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "없음" }, { status: 404 });
  /* 인증 없는 상세 조회 — 작성자 이메일은 떼고 내보낸다. */
  return NextResponse.json({ report: toPublicReport(report) });
}

/**
 * 소유자 판정.
 *
 * 예전 조건은 `!isAdmin && existing.authorId && existing.authorId !== email` 이었다.
 * `authorId` 가 null 이면 **조건 자체가 건너뛰어져** 아무나 통과했다. 실제로는
 * 그 뒤 updateReport 의 `.eq("author_id", email)` 이 null 행에 안 걸려 404 가 났지만,
 * 그건 이 검사가 막은 게 아니라 우연히 다른 데서 막힌 것이고 문구도 "수정 실패"라
 * 권한 문제인 줄 알 수 없었다. 절대 안 걸리는 조건은 방어가 아니라 거짓 안전망이다.
 *
 * 주인 없는 리포트(author_id=null)는 관리자만 손댄다.
 */
function ownerCheck(
  authorId: string | null,
  email: string,
  isAdmin: boolean,
): { ok: true } | { ok: false; status: number; error: string } {
  if (isAdmin) return { ok: true };
  const owner = normEmailOrNull(authorId);
  if (!owner) {
    return { ok: false, status: 403, error: "작성자 정보가 없는 리포트입니다. 관리자에게 문의해 주세요." };
  }
  if (owner !== normEmailOrNull(email)) {
    return { ok: false, status: 403, error: "권한이 없습니다." };
  }
  return { ok: true };
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
  const email = session.user.email;
  const isAdmin = session.user.role === "admin";

  // 소유 여부 확인
  const existing = await getReport(id);
  if (!existing) return NextResponse.json({ error: "없음" }, { status: 404 });
  const gate = ownerCheck(existing.authorId, email, isAdmin);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const updated = await updateReport(id, body, isAdmin ? undefined : email);
  if (!updated) return NextResponse.json({ error: "수정 실패" }, { status: 404 });
  /* 응답은 본인/관리자에게만 가지만, 굳이 이메일을 되돌려 줄 이유가 없다. */
  return NextResponse.json({ report: toPublicReport(updated) });
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
  const email = session.user.email;
  const isAdmin = session.user.role === "admin";

  // 소유 여부 확인
  const existing = await getReport(id);
  if (!existing) return NextResponse.json({ error: "없음" }, { status: 404 });
  const gate = ownerCheck(existing.authorId, email, isAdmin);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  await deleteReport(id, isAdmin ? undefined : email);
  return NextResponse.json({ ok: true });
}
