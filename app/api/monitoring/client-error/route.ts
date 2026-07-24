import { NextResponse, type NextRequest } from "next/server";
import { captureException } from "@/lib/monitoring/capture";

/**
 * G10: 클라이언트에서 발생해 error.tsx 로 잡힌 예외를 서버 모니터링 싱크로 전달한다.
 * lib/monitoring/capture 는 server-only 라 클라이언트에서 직접 부를 수 없어 이 경유지가 필요하다.
 * 저장소에 쓰지 않고 캡처만 하므로 실패해도 사용자 흐름에 영향이 없다.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  message?: unknown;
  digest?: unknown;
  path?: unknown;
  scope?: unknown;
};

const s = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(req: NextRequest): Promise<Response> {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const message = s(body.message, 500);
  if (!message) {
    return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });
  }

  captureException(new Error(message), {
    source: "client",
    scope: s(body.scope, 32) ?? "error-boundary",
    digest: s(body.digest, 64),
    path: s(body.path, 256),
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 256) || null,
  });

  return NextResponse.json({ ok: true });
}
