/**
 * /api/admin/social-uploads — 릴스·쇼츠 업로드 큐 관리 (관리자 전용).
 *
 * GET  최근 50건 (상태·오류 포함 — 반쪽 성공이 그대로 보인다)
 * POST 큐 등록 { videoUrl, title, caption?, hashtags?, scheduledAt?, targets? }
 *      videoUrl 은 https 공개 URL 이어야 한다 — IG 발행 API 가 메타 서버에서
 *      직접 받아 간다. 스토리지 public 버킷(social-videos)에 올린 URL 권장.
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { safeAuth } from "@/lib/safe-auth";
import { enqueueUpload, listUploads } from "@/lib/social/store";
import { isInstagramConfigured } from "@/lib/social/instagram";
import { isYouTubeConfigured } from "@/lib/social/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  try {
    const items = await listUploads(50);
    return NextResponse.json({
      items,
      /* 어드민 화면이 "등록해도 자격 증명이 없어 대기만 한다"를 등록 전에
         알 수 있도록 — 눌러 보기 전엔 알 수 없는 실패보다 사실을 먼저. */
      configured: { instagram: isInstagramConfigured(), youtube: isYouTubeConfigured() },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const session = await safeAuth();
  const body = (await req.json().catch(() => null)) as {
    videoUrl?: string;
    title?: string;
    caption?: string;
    hashtags?: string[];
    scheduledAt?: string;
    targets?: { instagram?: boolean; youtube?: boolean };
  } | null;

  const videoUrl = body?.videoUrl?.trim();
  const title = body?.title?.trim();
  if (!videoUrl || !title) {
    return NextResponse.json({ error: "videoUrl 과 title 은 필수입니다." }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(videoUrl);
  } catch {
    return NextResponse.json({ error: "videoUrl 이 URL 이 아닙니다." }, { status: 400 });
  }
  if (parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "videoUrl 은 https 공개 URL 이어야 합니다 (IG 발행 요건)." },
      { status: 400 },
    );
  }
  const scheduledAt = body?.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "scheduledAt 이 시각이 아닙니다." }, { status: 400 });
  }
  const targets = {
    instagram: body?.targets?.instagram !== false,
    youtube: body?.targets?.youtube !== false,
  };
  if (!targets.instagram && !targets.youtube) {
    return NextResponse.json({ error: "대상이 없습니다 (instagram/youtube 중 1개 이상)." }, { status: 400 });
  }

  try {
    const row = await enqueueUpload({
      videoUrl,
      title: title.slice(0, 100),
      caption: (body?.caption ?? "").slice(0, 2000),
      hashtags: (body?.hashtags ?? []).map((h) => String(h).trim()).filter(Boolean).slice(0, 30),
      scheduledAt: scheduledAt?.toISOString(),
      targets,
      createdBy: session?.user?.email ?? "admin",
    });
    return NextResponse.json({
      ok: true,
      item: row,
      configured: { instagram: isInstagramConfigured(), youtube: isYouTubeConfigured() },
      note:
        !isInstagramConfigured() || !isYouTubeConfigured()
          ? "일부 대상의 자격 증명이 미설정 — 큐에는 들어갔고 env 설정 후 자동 집행됩니다 (docs/social-shorts-setup.md)"
          : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "등록 실패" },
      { status: 500 },
    );
  }
}
