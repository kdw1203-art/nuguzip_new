/**
 * 속도 제한 유틸.
 *
 * 1) `rateLimit(key, { limit, windowMs })` — 키 기반 인메모리 슬라이딩 윈도우.
 *    프로세스 내 Map 사용 → 인스턴스별 best-effort (아래 함수 주석 참고).
 *
 * 2) `applyRateLimit(req, opts)` — 기존 요청 기반 헬퍼 (다수 라우트 사용 중).
 *    UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN 설정 시 Upstash Redis,
 *    미설정이면 프로세스 내 고정 윈도우로 처리.
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

/* ------------------------------------------------------------------ */
/* 키 기반 슬라이딩 윈도우 (인메모리)                                    */
/* ------------------------------------------------------------------ */

export interface SlidingWindowOptions {
  /** 윈도우 내 최대 요청 수 */
  limit: number;
  /** 윈도우 길이(ms) */
  windowMs: number;
}

interface SlidingEntry {
  /** 윈도우 내 요청 타임스탬프(ms, 오름차순) */
  hits: number[];
  windowMs: number;
}

const slidingStore = new Map<string, SlidingEntry>();
let lastGlobalPrune = 0;

/** 마지막 요청이 윈도우를 벗어난 키를 통째로 제거 (메모리 증가 방지) */
function pruneSlidingStore(now: number): void {
  for (const [key, entry] of slidingStore) {
    const last = entry.hits[entry.hits.length - 1];
    if (last === undefined || now - last >= entry.windowMs) {
      slidingStore.delete(key);
    }
  }
}

/**
 * 키 기반 슬라이딩 윈도우 속도 제한.
 *
 * 주의: 프로세스 내 Map 기반이라 **인스턴스별 best-effort** 입니다.
 * 서버리스/멀티 인스턴스 배포에서는 인스턴스마다 카운터가 따로 돌므로
 * 전역 상한이 아니라 "인스턴스당 상한"으로 동작합니다. (남용 완화 목적으로는 충분)
 *
 * @example
 * const rl = rateLimit(`register:${ip}`, { limit: 5, windowMs: 10 * 60_000 });
 * if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: SlidingWindowOptions,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();

  // 1분에 한 번 전체 스토어에서 만료 키 정리
  if (now - lastGlobalPrune > 60_000) {
    lastGlobalPrune = now;
    pruneSlidingStore(now);
  }

  let entry = slidingStore.get(key);
  if (!entry || entry.windowMs !== windowMs) {
    entry = { hits: [], windowMs };
    slidingStore.set(key, entry);
  }

  // 윈도우 밖으로 밀려난 타임스탬프 제거
  const cutoff = now - windowMs;
  entry.hits = entry.hits.filter((t) => t > cutoff);

  if (entry.hits.length >= limit) {
    const oldest = entry.hits[0]!;
    const retryAfterMs = oldest + windowMs - now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  entry.hits.push(now);
  return { ok: true, retryAfterSec: 0 };
}

/** 요청자 IP 식별: x-forwarded-for 첫 값 → x-real-ip → "unknown" */
export function getClientIp(req: { headers: Headers }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** 429 한국어 응답 헬퍼 (Retry-After 헤더 포함) */
export function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: `요청이 너무 많습니다. ${retryAfterSec}초 후 다시 시도해 주세요.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

/* ------------------------------------------------------------------ */
/* 기존 요청 기반 API (applyRateLimit) — 다수 라우트가 사용 중            */
/* ------------------------------------------------------------------ */

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

export async function requestRateLimit(
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
  const result = await requestRateLimit(req, opts);
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
