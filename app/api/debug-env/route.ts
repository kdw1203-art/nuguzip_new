import { NextResponse } from "next/server";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";

export const dynamic = "force-dynamic";

/** 임시 진단 라우트 — 확인 후 즉시 제거 예정. 값은 노출하지 않고 존재 여부만. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "nz-diag-7f3a") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const present = (k: string) => Boolean(process.env[k]?.trim());
  const sb = getReadOnlySupabase();
  let queryResult: string = "no-client";
  if (sb) {
    try {
      const { data, error } = await sb
        .from("board_posts")
        .select("id")
        .eq("board_type", "community")
        .eq("is_published", true)
        .limit(3);
      queryResult = error
        ? `error: ${error.message}`
        : `ok: ${data?.length ?? 0} rows`;
    } catch (e) {
      queryResult = `throw: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return NextResponse.json({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: present("NEXT_PUBLIC_SUPABASE_URL"),
      SUPABASE_URL: present("SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: present("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      SUPABASE_ANON_KEY: present("SUPABASE_ANON_KEY"),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: present(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ),
      SUPABASE_SERVICE_ROLE_KEY: present("SUPABASE_SERVICE_ROLE_KEY"),
    },
    client: sb ? "ok" : "null",
    queryResult,
  });
}
