/**
 * GET/POST /api/cron/site-probe — 프로덕션 HTTP 프로브를 ops.site_probe 에 기록.
 *
 * ── 왜 있나 ────────────────────────────────────────────────────────────
 * ops.etl_freshness() 의 site.http_probe 검사(마이그레이션 20260811223945)는
 * "예약 잡이 ops.record_site_probe() 를 호출"하는 것을 전제한다. RUM 하트비트가
 * 트래픽 규모 때문에 구조적으로 판정 불능임이 실측으로 확정되어 도입된 검사인데,
 * 기록하는 잡이 없으면 이 검사도 영원히 unknown 이다 — 안전망이 아니라 장식이 된다.
 *
 * ── 한계 (정직하게) ─────────────────────────────────────────────────────
 * 이 프로브는 Vercel 함수에서 나가서 공개 도메인(CDN 에지)을 거쳐 돌아온다.
 * 5xx·잘못된 배포·인증서 문제는 잡지만, Vercel 리전 전체 장애는 프로버 자신도
 * 함께 죽어서 못 잡는다. 다만 그 경우 기록이 끊겨 probed_at 이 낡고, 검사가
 * 26h/50h 초과로 warn/critical 을 낸다 — 침묵이 아니라 지연 감지다.
 * 진짜 외부 관측은 .github/workflows/synthetic.yml (GitHub 러너, 하루 2회)이
 * 이미 하고 있다 — 거기서도 이 라우트를 호출해 기록하도록 패치를 별도 제공
 * (워크플로 쓰기 권한이 없어 소유자 적용 필요, docs/patches/ 참고).
 *
 * 파라미터: ?url=... (기본 https://nuguzip.com/ — 같은 오리진만 허용)
 * 보호: lib/cron/authorize.ts (CRON_SECRET Bearer/헤더 · 관리자 세션)
 *       vercel.json crons 가 Authorization: Bearer <CRON_SECRET> 으로 부른다.
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_ORIGIN = "https://nuguzip.com";
const PROBE_TIMEOUT_MS = 30_000;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  /* 같은 오리진만 — 임의 URL 을 받으면 이 라우트가 인증된 SSRF 프록시가 된다. */
  const rawUrl = new URL(req.url).searchParams.get("url");
  let target = ALLOWED_ORIGIN + "/";
  if (rawUrl) {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl, ALLOWED_ORIGIN);
    } catch {
      return NextResponse.json({ error: "url 파라미터가 URL 이 아닙니다." }, { status: 400 });
    }
    if (parsed.origin !== ALLOWED_ORIGIN) {
      return NextResponse.json(
        { error: `${ALLOWED_ORIGIN} 경로만 프로브할 수 있습니다.` },
        { status: 400 },
      );
    }
    target = parsed.toString();
  }

  /* [OPT-44] 커버리지 확장 — ?url 미지정(크론 기본 호출)이면 핵심 경로 4곳을
     순서대로 재서 각각 기록한다. 응답시간 추세가 "이 배포가 느리게 만들었나"에
     데이터로 답한다. 개별 타임아웃 12초 × 4 = 최악 48초 < maxDuration 60초. */
  const targets: string[] = rawUrl
    ? [target]
    : ["/", "/analysis", "/apply", "/analysis/accuracy"].map((p) => ALLOWED_ORIGIN + p);
  const perProbeTimeout = rawUrl ? PROBE_TIMEOUT_MS : 12_000;

  async function probeOne(url: string): Promise<{
    target: string;
    status: number | null;
    ttfbMs: number | null;
    vercelError: string | null;
    note: string | null;
  }> {
    let status: number | null = null;
    let ttfbMs: number | null = null;
    let vercelError: string | null = null;
    let note: string | null = "vercel-cron self-probe";
    const startedAt = performance.now();
    try {
      const res = await fetch(url, {
        cache: "no-store",
        redirect: "manual", // 3xx 도 그대로 기록 — 홈이 리다이렉트면 그것 자체가 이상 신호다
        signal: AbortSignal.timeout(perProbeTimeout),
        headers: { "user-agent": "nuguzip-site-probe/1" },
      });
      ttfbMs = Math.round((performance.now() - startedAt) * 10) / 10;
      status = res.status;
      vercelError = res.headers.get("x-vercel-error");
      res.body?.cancel().catch(() => {});
    } catch (e) {
      /* 실패도 기록한다 — status null 이 곧 critical 판정 근거다. */
      ttfbMs = Math.round((performance.now() - startedAt) * 10) / 10;
      note = `fetch 실패: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
    }
    return { target: url, status, ttfbMs, vercelError, note };
  }

  const probes: Awaited<ReturnType<typeof probeOne>>[] = [];
  for (const url of targets) probes.push(await probeOne(url));
  const first = probes[0];
  const status = first.status;
  const ttfbMs = first.ttfbMs;
  const vercelError = first.vercelError;
  const note = first.note;
  target = first.target;

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "서비스 클라이언트 미구성 — 프로브를 기록하지 못했습니다.", probed: { target, status, ttfbMs } },
      { status: 500 },
    );
  }
  let firstId: unknown = null;
  for (const p of probes) {
    const { data, error } = await sb.rpc("record_site_probe_service", {
      p_url: p.target,
      p_status: p.status,
      p_ttfb_ms: p.ttfbMs,
      p_vercel_error: p.vercelError,
      p_note: p.note,
    });
    if (error) {
      /* 기록 실패는 실패다 — 200 으로 눙치면 검사가 낡은 프로브를 보게 된다. */
      return NextResponse.json(
        { ok: false, error: `기록 실패: ${error.message}`, probed: probes },
        { status: 500 },
      );
    }
    if (firstId == null) firstId = data;
  }

  return NextResponse.json({
    ok: true,
    id: firstId,
    probed: probes.length === 1 ? { target, status, ttfbMs, vercelError, note } : probes,
    finishedAt: new Date().toISOString(),
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
