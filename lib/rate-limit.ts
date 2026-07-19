/**
 * 슬라이딩 윈도우 속도 제한.
 *
 * 우선 순위:
 *  1) UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN 이 설정돼 있으면 Upstash Redis 사용
 *  2) 미설정이면 Node.js 프로세스 내 Map 으로 처리 (단일 인스턴스/개발 환경)
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export interface RateLimitOptions {
  /** 윈도우 내 최대 요청 수 (기본 60) */
  max?: number;
  /** 윈도우 길이(ms) (기본 60_000 = 1분) */
  windowMs?: number;
  /** 요청자 식별 키. 기본은 X-Forwarded-For → 연결 IP */
  keyFn?: (req: NextRequest) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const inMemory = new Map<string, Bucket>();

function memoryRateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = inMemory.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    inMemory.set(key, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, max - bucket.count);
  return { ok: bucket.count <= max, remaining, resetAt: bucket.resetAt };
}

async function upstashRateLimit(
  key: string,
  max: number,
  windowMs: number,
  url: string,
  token: string,
): Promise<{ ok: boolean; remaining: number; resetAt: number }> {
  const windowSec = Math.ceil(windowMs / 1000);
  try {
    const pipeline = [
      ["INCR", key],
      ["EXPIRE", key, windowSec.toString()],
    ];
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
    });
    const json = (await res.json()) as Array<{ result: number }>;
    const count = json[0]?.result ?? 1;
    const remaining = Math.max(0, max - count);
    const resetAt = Date.now() + windowMs;
    return { ok: count <= max, remaining, resetAt };
  } catch {
    return { ok: true, remaining: max, resetAt: Date.now() + windowMs };
  }
}

export async function rateLimit(
  req: NextRequest,
  opts: RateLimitOptions = {},
): Promise<{ ok: boolean; remaining: number; resetAt: number }> {
  const { max = 60, windowMs = 60_000, keyFn } = opts;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const key = keyFn ? keyFn(req) : `rl:${ip}:${req.nextUrl.pathname}`;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (upstashUrl && upstashToken) {
    return upstashRateLimit(key, max, windowMs, upstashUrl, upstashToken);
  }
  return memoryRateLimit(key, max, windowMs);
}

/**
 * Route Handler 에서 사용하는 헬퍼.
 * 초과 시 429 Response 를 반환하고, 정상이면 null 을 반환합니다.
 *
 * @example
 * const limited = await applyRateLimit(req);
 * if (limited) return limited;
 */
export async function applyRateLimit(
  req: NextRequest,
  opts: RateLimitOptions = {},
): Promise<NextResponse | null> {
  const result = await rateLimit(req, opts);
  if (!result.ok) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((result.resetAt - Date.now()) / 1000).toString(),
          "X-RateLimit-Limit": String(opts.max ?? 60),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        },
      },
    );
  }
  return null;
}

/** 5분에 10회 — 로그인·회원가입 등 민감 엔드포인트용 */
export const AUTH_RATE_LIMIT: RateLimitOptions = { max: 10, windowMs: 5 * 60_000 };
/** 1분에 30회 — 일반 POST 엔드포인트 */
export const WRITE_RATE_LIMIT: RateLimitOptions = { max: 30, windowMs: 60_000 };
/** 1분에 60회 — GET 엔드포인트 */
export const READ_RATE_LIMIT: RateLimitOptions = { max: 60, windowMs: 60_000 };
