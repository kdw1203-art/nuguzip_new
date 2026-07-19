import { NextResponse } from "next/server";

export function ok<T extends Record<string, unknown>>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function apiError(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message, ...(details ?? {}) },
    },
    { status },
  );
}

