import { timingSafeEqual } from "node:crypto";
import { isAdminApiRequest } from "@/lib/admin/api-auth";

/**
 * 크론/ETL 라우트 공용 인가 — 모든 `app/api/cron/*` 과 `app/api/etl/*` 이 이 함수 하나만 쓴다.
 *
 * 이전 인라인 구현에는 우회 경로가 둘 있었다.
 *  1) `x-vercel-cron: 1` 헤더를 믿었다. 이건 그냥 요청 헤더라 아무나 붙일 수 있다 —
 *     플랫폼이 서명해 주는 값이 아니다. 그래서 분기 자체를 없앴다.
 *  2) `CRON_SECRET` 이 비어 있으면 `: true` 로 흘러 **누구나 통과**했다(fail-open).
 *     키가 없는 상태는 "인증 불가" 이지 "인증 통과" 가 아니다 — fail-closed 로 뒤집었다.
 *
 * 시크릿은 `Authorization: Bearer <secret>` 또는 `x-cron-secret` 헤더로만 받는다.
 * `?secret=` 쿼리스트링 지원은 제거했다 — URL 은 Vercel/CDN/브라우저 액세스 로그와
 * Referer 에 그대로 남아 시크릿이 평문으로 유출된다. 호출부(.github/workflows/etl.yml,
 * 어드민 수집 패널)는 헤더로 보내야 한다.
 *
 * 비교는 `timingSafeEqual` 로 한다. 길이가 다르면 이 함수가 던지므로 길이를 먼저 본다
 * (길이 노출은 시크릿 자체에 비하면 무의미한 정보다).
 *
 * 관리자 세션 폴백은 남겨 둔다 — 운영자가 어드민 콘솔에서 수동 실행하는 경로다.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 요청에서 크론 시크릿을 뽑는다(헤더 전용). 없으면 null. */
function readProvidedSecret(req: Request): string | null {
  const authorization = req.headers.get("authorization")?.trim();
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (match) return match[1].trim();
  }
  const header = req.headers.get("x-cron-secret")?.trim();
  return header ? header : null;
}

export async function authorizeCron(req: Request): Promise<boolean> {
  const expected = process.env.CRON_SECRET?.trim();
  // 키가 없으면 시크릿 인가는 아예 성립하지 않는다 — 관리자 세션만 남는다.
  if (expected) {
    const provided = readProvidedSecret(req);
    if (provided && secretMatches(provided, expected)) return true;
  }
  return await isAdminApiRequest();
}
