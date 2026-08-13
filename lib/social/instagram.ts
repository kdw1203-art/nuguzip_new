import "server-only";
import { logger } from "@/lib/log";

/**
 * Instagram 릴스 발행 — Meta Graph API (Content Publishing).
 *
 * 흐름(메타 공식 3단계):
 *   1) POST /{ig-user-id}/media  media_type=REELS, video_url, caption → 컨테이너 생성
 *   2) GET  /{container-id}?fields=status_code 를 FINISHED 까지 폴링
 *      (메타가 video_url 에서 영상을 받아 인코딩하는 시간 — 보통 수십 초)
 *   3) POST /{ig-user-id}/media_publish  creation_id → 발행, media id 반환
 *
 * 요구 조건(후속 절차 문서 참고): 비즈니스/크리에이터 IG 계정 + 연결된 페이스북
 * 페이지, instagram_content_publish 권한이 승인된 메타 앱, 장기 액세스 토큰.
 * video_url 은 공개 URL 이어야 한다(스토리지 public 버킷).
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const POLL_INTERVAL_MS = 5_000;
const POLL_MAX = 24; // 최대 2분 — 넘으면 재시도 가능 실패로 돌려 다음 크론이 잇는다

export function isInstagramConfigured(): boolean {
  return Boolean(
    process.env.META_IG_USER_ID?.trim() && process.env.META_IG_ACCESS_TOKEN?.trim(),
  );
}

export type PublishResult =
  | { ok: true; mediaId: string }
  | { ok: false; error: string; retryable: boolean };

async function graphFetch(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

function graphError(json: Record<string, unknown>): string {
  const err = json.error as { message?: string; code?: number } | undefined;
  return err?.message ? `${err.message} (code ${err.code ?? "?"})` : JSON.stringify(json).slice(0, 200);
}

export async function publishReel(input: {
  videoUrl: string;
  caption: string;
}): Promise<PublishResult> {
  const userId = process.env.META_IG_USER_ID?.trim();
  const token = process.env.META_IG_ACCESS_TOKEN?.trim();
  if (!userId || !token) {
    // 자격 증명 미설정은 "실패"가 아니라 "아직 집행 불가" — 재시도 가능으로 돌려
    // 소유자가 env 를 채우면 다음 크론이 그대로 잇는다.
    return {
      ok: false,
      retryable: true,
      error: "META_IG_USER_ID·META_IG_ACCESS_TOKEN 미설정 — docs/social-shorts-setup.md 절차 필요",
    };
  }

  try {
    // 1) 컨테이너 생성
    const create = await graphFetch(`/${userId}/media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: input.videoUrl,
        caption: input.caption,
        share_to_feed: true,
        access_token: token,
      }),
    });
    const containerId = create.json.id as string | undefined;
    if (!containerId) {
      return {
        ok: false,
        retryable: create.status >= 500,
        error: `컨테이너 생성 실패: ${graphError(create.json)}`,
      };
    }

    // 2) 인코딩 완료 폴링
    for (let i = 0; i < POLL_MAX; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const st = await graphFetch(
        `/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
      );
      const code = st.json.status_code as string | undefined;
      if (code === "FINISHED") {
        // 3) 발행
        const pub = await graphFetch(`/${userId}/media_publish`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ creation_id: containerId, access_token: token }),
        });
        const mediaId = pub.json.id as string | undefined;
        if (mediaId) return { ok: true, mediaId };
        return { ok: false, retryable: pub.status >= 500, error: `발행 실패: ${graphError(pub.json)}` };
      }
      if (code === "ERROR" || code === "EXPIRED") {
        return { ok: false, retryable: false, error: `메타 인코딩 ${code} — 영상 형식(권장: MP4/9:16/≤90초)을 확인하세요` };
      }
      // IN_PROGRESS → 계속 대기
    }
    return {
      ok: false,
      retryable: true,
      error: "인코딩 대기 2분 초과 — 다음 크론에서 재시도(컨테이너는 메타 쪽에서 이어짐)",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("[social:ig]", msg);
    return { ok: false, retryable: true, error: `네트워크/시간 초과: ${msg}` };
  }
}
