import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getJob } from "@/lib/inspection/session-store";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 못 읽은 작업을 404 "없음"으로 답하지 않기 위한 안내. */
const JOB_UNAVAILABLE = "지금은 작업 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  /* 이 엔드포인트는 폴링 대상이다. 조회 실패를 404 로 답하면 클라이언트는
     "작업이 사라졌다"로 보고 폴링을 접는데, 실제 작업은 계속 돌고 있다.
     503 으로 답해야 잠시 뒤 다시 물어본다. */
  let job: Awaited<ReturnType<typeof getJob>>;
  try {
    job = await getJob(id);
  } catch (err) {
    return dbUnavailable(`AI 작업 조회 실패 (id=${id})`, err, JOB_UNAVAILABLE);
  }
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ job });
}
