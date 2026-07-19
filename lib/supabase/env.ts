/** 브라우저·서버(SSR) 공통 — anon(레거시) 또는 Publishable 키(신규) */
export function getSupabaseUrl(): string | undefined {
  const candidates = [
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    process.env.SUPABASE_URL?.trim(),
  ];
  // http(s) URL만 허용 — 일부 환경엔 SUPABASE_URL이 Postgres 연결 문자열로
  // 들어가 있어 그대로 쓰면 @supabase/ssr가 throw함 (edge 500 원인)
  for (const u of candidates) {
    if (!u) continue;
    try {
      const parsed = new URL(u);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return u;
    } catch {
      // 무시하고 다음 후보
    }
  }
  return undefined;
}

export function getSupabasePublicKey(): string | undefined {
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  const publishable =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  return anon || publishable || undefined;
}

/** `https://xxx.supabase.co` → 프로젝트 ref `xxx` (대시보드 URL용). */
export function getSupabaseProjectRefFromUrl(): string | null {
  const u = getSupabaseUrl();
  if (!u) return null;
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (!host.endsWith(".supabase.co")) return null;
    const ref = host.replace(/\.supabase\.co$/i, "");
    return ref || null;
  } catch {
    return null;
  }
}

/** API 키(service_role) 복사 페이지로 바로 이동. */
export function getSupabaseDashboardApiSettingsUrl(): string | null {
  const ref = getSupabaseProjectRefFromUrl();
  if (!ref) return null;
  return `https://supabase.com/dashboard/project/${ref}/settings/api`;
}
