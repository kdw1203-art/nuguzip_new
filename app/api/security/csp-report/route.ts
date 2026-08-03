import { NextRequest } from "next/server";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSP 위반 리포트 수집 엔드포인트.
 *
 * lib/security/content-security-policy.ts 의 `report-uri` 가 이 경로를 가리킨다.
 * 지금 enforce 정책은 그대로 두고(아무것도 안 깨진다) 여기서 위반만 모은다:
 *   · 현재 정책이 실제로 차단하고 있는 정상 리소스(= 우리가 몰랐던 사용자 화면 깨짐)
 *   · 주입된 스크립트/외부 리소스 로드 시도(= 공격 신호)
 * 이 데이터가 쌓여야 다음 단계(script-src 에서 'unsafe-inline' 제거 + nonce 도입)를
 * 안전하게 넘어갈 수 있다. 리포트 없이 enforce 를 조이면 어디가 깨질지 모른 채 배포하게 된다.
 *
 * 브라우저가 보내는 본문 형식은 두 가지다:
 *   · application/csp-report        → { "csp-report": { ... } }   (report-uri, 레거시·광범위 지원)
 *   · application/reports+json      → [ { "type":"csp-violation", "body": { ... } }, ... ] (report-to)
 * 둘 다 받아서 핵심 필드만 뽑아 남긴다.
 */

// 로그 폭주 방지 — 인스턴스당 분당 상한. 브라우저가 같은 위반을 반복해 보내도 로그를 덮지 않게.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 50;
let windowStart = 0;
let countInWindow = 0;

// 본문 크기 상한(악의적 대용량 전송 차단). CSP 리포트는 원래 작다.
const MAX_BODY_BYTES = 16 * 1024;

function throttled(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    countInWindow = 0;
  }
  countInWindow += 1;
  return countInWindow > MAX_PER_WINDOW;
}

type CspFields = {
  directive?: unknown;
  blockedUri?: unknown;
  documentUri?: unknown;
  sourceFile?: unknown;
};

function pick(v: unknown): CspFields | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  // report-uri(csp-report) 와 report-to(body) 는 키 표기가 다르다 — 둘 다 흡수.
  const directive = r["violated-directive"] ?? r["effectiveDirective"] ?? r["effective-directive"];
  const blockedUri = r["blocked-uri"] ?? r["blockedURL"] ?? r["blocked-url"];
  const documentUri = r["document-uri"] ?? r["documentURL"] ?? r["document-url"];
  const sourceFile = r["source-file"] ?? r["sourceFile"];
  if (directive === undefined && blockedUri === undefined) return null;
  return { directive, blockedUri, documentUri, sourceFile };
}

function truncate(v: unknown, n = 300): string | undefined {
  if (typeof v !== "string") return undefined;
  return v.length > n ? v.slice(0, n) + "…" : v;
}

export async function POST(req: NextRequest) {
  // 항상 204 로 답한다(성공/실패 무관) — 리포트는 fire-and-forget 라 본문·상태로
  // 정보를 주지 않는다. 파싱 실패나 스로틀도 조용히 삼킨다.
  try {
    if (throttled()) return new Response(null, { status: 204 });

    const raw = await req.text();
    if (!raw || raw.length > MAX_BODY_BYTES) {
      return new Response(null, { status: 204 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 204 });
    }

    const reports: CspFields[] = [];
    if (Array.isArray(parsed)) {
      // application/reports+json
      for (const item of parsed.slice(0, 20)) {
        const body = (item as Record<string, unknown>)?.["body"] ?? item;
        const f = pick(body);
        if (f) reports.push(f);
      }
    } else if (parsed && typeof parsed === "object") {
      // application/csp-report
      const f = pick((parsed as Record<string, unknown>)["csp-report"] ?? parsed);
      if (f) reports.push(f);
    }

    for (const f of reports) {
      logger.warn("[csp-report]", {
        directive: truncate(f.directive),
        blockedUri: truncate(f.blockedUri),
        documentUri: truncate(f.documentUri),
        sourceFile: truncate(f.sourceFile),
      });
    }
  } catch {
    // 무엇이 됐든 리포트 수집이 요청 처리를 방해하지 않게 한다.
  }
  return new Response(null, { status: 204 });
}

// 브라우저는 POST 로만 보낸다. 그 외 메서드는 조용히 204.
export function GET() {
  return new Response(null, { status: 204 });
}
