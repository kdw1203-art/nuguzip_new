import "server-only";
import { logger } from "@/lib/log";

/**
 * YouTube 쇼츠 업로드 — YouTube Data API v3 videos.insert (재개형 업로드).
 *
 * 쇼츠 판정은 유튜브가 한다: 세로(9:16) · 3분 이하 영상이면 쇼츠로 노출된다.
 * 제목/설명의 #Shorts 는 필수는 아니지만 분류를 돕는다 — 없으면 붙인다.
 *
 * 인증: OAuth2 리프레시 토큰(채널 소유자가 1회 발급 — 후속 절차 문서).
 * 쿼터: videos.insert = 1,600 유닛/건, 기본 일 10,000 유닛 → 하루 6건 상한.
 *       이 상한은 코드가 아니라 구글 쪽 한도다 — 초과 시 403 quotaExceeded 로
 *       재시도 가능 실패가 되며 다음 날 크론이 잇는다.
 */

const MAX_VIDEO_BYTES = 256 * 1024 * 1024; // 256MB — 쇼츠 원본으로 충분, 함수 메모리 보호

export function isYouTubeConfigured(): boolean {
  return Boolean(
    process.env.YT_CLIENT_ID?.trim() &&
      process.env.YT_CLIENT_SECRET?.trim() &&
      process.env.YT_REFRESH_TOKEN?.trim(),
  );
}

export type UploadResult =
  | { ok: true; videoId: string }
  | { ok: false; error: string; retryable: boolean };

async function accessTokenFromRefresh(): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YT_CLIENT_ID!.trim(),
      client_secret: process.env.YT_CLIENT_SECRET!.trim(),
      refresh_token: process.env.YT_REFRESH_TOKEN!.trim(),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string };
  return j.access_token ?? null;
}

export async function uploadShort(input: {
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
}): Promise<UploadResult> {
  if (!isYouTubeConfigured()) {
    return {
      ok: false,
      retryable: true,
      error: "YT_CLIENT_ID·YT_CLIENT_SECRET·YT_REFRESH_TOKEN 미설정 — docs/social-shorts-setup.md 절차 필요",
    };
  }

  try {
    const token = await accessTokenFromRefresh();
    if (!token) {
      return {
        ok: false,
        retryable: false,
        error: "액세스 토큰 갱신 실패 — 리프레시 토큰이 만료/회수됐을 수 있습니다(재발급 절차 참고)",
      };
    }

    // 영상 본문 확보 — IG 와 달리 유튜브는 URL 을 안 받고 바이트를 요구한다
    const videoRes = await fetch(input.videoUrl, { signal: AbortSignal.timeout(120_000) });
    if (!videoRes.ok) {
      return { ok: false, retryable: true, error: `영상 다운로드 실패: HTTP ${videoRes.status}` };
    }
    const buf = Buffer.from(await videoRes.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_VIDEO_BYTES) {
      return {
        ok: false,
        retryable: false,
        error: `영상 크기 부적합: ${buf.byteLength}바이트 (허용 1B ~ ${MAX_VIDEO_BYTES}B)`,
      };
    }

    const title = input.title.includes("#Shorts") ? input.title : `${input.title} #Shorts`;

    // 재개형 업로드 세션 시작
    const init = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-type": "video/mp4",
          "x-upload-content-length": String(buf.byteLength),
        },
        body: JSON.stringify({
          snippet: {
            title: title.slice(0, 100),
            description: input.description.slice(0, 4900),
            tags: input.tags.slice(0, 30),
            categoryId: "26", // Howto & Style — 부동산 정보성 콘텐츠에 근접한 범주
          },
          status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!init.ok) {
      const body = await init.text().catch(() => "");
      const quota = body.includes("quotaExceeded");
      return {
        ok: false,
        retryable: quota || init.status >= 500,
        error: quota
          ? "유튜브 일일 쿼터 초과(기본 6건/일) — 다음 날 크론이 재시도"
          : `업로드 세션 시작 실패: HTTP ${init.status} ${body.slice(0, 200)}`,
      };
    }
    const uploadUrl = init.headers.get("location");
    if (!uploadUrl) return { ok: false, retryable: true, error: "업로드 세션 URL 누락" };

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": "video/mp4", "content-length": String(buf.byteLength) },
      body: buf,
      signal: AbortSignal.timeout(240_000),
    });
    const pj = (await put.json().catch(() => ({}))) as { id?: string };
    if (put.ok && pj.id) return { ok: true, videoId: pj.id };
    return {
      ok: false,
      retryable: put.status >= 500,
      error: `본문 업로드 실패: HTTP ${put.status} ${JSON.stringify(pj).slice(0, 200)}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("[social:yt]", msg);
    return { ok: false, retryable: true, error: `네트워크/시간 초과: ${msg}` };
  }
}
