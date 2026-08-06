import { getServiceSupabase } from "@/lib/supabase/service";
import { normEmailOrNull, safePublicAuthorLabel } from "@/lib/privacy/mask-email";

export type UserReport = {
  id: string;
  authorId: string | null;
  authorEmail?: string | null;
  authorLabel?: string | null;
  title: string;
  subtitle?: string | null;
  category: string;
  region?: string | null;
  price: number;
  originalPrice: number;
  tags: string[];
  tableOfContents: string[];
  previewContent?: string | null;
  rating: number;
  reviews: number;
  downloads: number;
  views: number;
  pages: number;
  isPremium: boolean;
  gradient?: string | null;
  publishedAt: string;
  updatedAt: string;
};

const memory: UserReport[] = [];

/**
 * 공개 응답용 형태 — 작성자 이메일을 뗀다.
 *
 * `author_id` 는 이제 **이메일**이다(20260806154632). mapRow 는 그 값을
 * `authorId` 와 `authorEmail` 두 자리에 담으므로, UserReport 를 그대로
 * `NextResponse.json` 에 실으면 크리에이터 이메일이 로그인도 안 한 사람에게
 * 나간다. DB 쪽은 컬럼 GRANT 로 막았지만 이 앱은 service-role 로 읽으므로
 * 그 방어가 여기까지 오지 않는다 — 응답 경계에서 한 번 더 뗀다.
 *
 * `authorLabel` 은 남긴다. 그건 공개하려고 만든 값이고, 저장 시점에
 * safePublicAuthorLabel 로 이미 마스킹돼 들어간다.
 */
export type PublicReport = Omit<UserReport, "authorId" | "authorEmail">;

export function toPublicReport(r: UserReport): PublicReport {
  const { authorId: _authorId, authorEmail: _authorEmail, ...rest } = r;
  return rest;
}

/** 리포트 목록. **조회 실패는 던진다** — 빈 배열로 접지 않는다.
 *
 *  예전엔 `if (error) return []` 이었다. 그래서 홈은 조회가 죽어도 실패한 줄
 *  모르고(landing/data.ts 의 allSettled 가 "성공했는데 0건"으로 받는다)
 *  `failedSources` 에 "reports" 가 실릴 수 있는 경로가 아예 없었다 —
 *  실패 표시 코드는 있는데 켜지지 않는 스위치였다. 호출부는 셋 다 실패를
 *  다룰 수 있다(둘은 allSettled, GET /api/reports 는 아래에서 500). */
export async function listReports(): Promise<UserReport[]> {
  const sb = getServiceSupabase();
  if (!sb) return memory;
  const { data, error } = await sb
    .from("reports")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`[reports] 목록 조회 실패: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export async function getReport(id: string): Promise<UserReport | null> {
  const sb = getServiceSupabase();
  if (!sb) return memory.find((r) => r.id === id) ?? null;
  const { data, error } = await sb
    .from("reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function createReport(input: {
  title: string;
  subtitle?: string;
  category: string;
  region?: string;
  price?: number;
  tags?: string[];
  tableOfContents?: string[];
  previewContent?: string;
  pages?: number;
  isPremium?: boolean;
  authorLabel?: string;
  authorEmail?: string;
}): Promise<UserReport> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  /* 소유자 판정을 이메일로 하는 표라 저장할 때 한 번 낮춰 둔다. 안 낮추면
     "KDW1203@gmail.com" 으로 등록한 리포트를 "kdw1203@gmail.com" 세션이
     못 고친다 — 소유자인데 404 를 본다. */
  const ownerEmail = normEmailOrNull(input.authorEmail);
  /* author_label 은 anon 이 읽는 공개 컬럼이다. 호출부가 이름 대신 이메일을
     넘기는 경로가 실제로 있어서(session.user.name ?? email) 여기서 막는다. */
  const label = safePublicAuthorLabel(input.authorLabel, ownerEmail);
  const rec: UserReport = {
    id: `mem-${Date.now().toString(36)}`,
    authorId: ownerEmail,
    authorEmail: ownerEmail,
    authorLabel: label,
    title: input.title,
    subtitle: input.subtitle ?? null,
    category: input.category,
    region: input.region ?? null,
    price: input.price ?? 0,
    originalPrice: input.price ?? 0,
    tags: input.tags ?? [],
    tableOfContents: input.tableOfContents ?? [],
    previewContent: input.previewContent ?? null,
    rating: 0,
    reviews: 0,
    downloads: 0,
    views: 0,
    pages: input.pages ?? 10,
    isPremium: input.isPremium ?? false,
    gradient: null,
    publishedAt: now,
    updatedAt: now,
  };
  if (!sb) {
    memory.unshift(rec);
    return rec;
  }
  const { data, error } = await sb
    .from("reports")
    .insert({
      title: input.title,
      subtitle: input.subtitle ?? null,
      category: input.category,
      region: input.region ?? null,
      price: input.price ?? 0,
      original_price: input.price ?? 0,
      tags: input.tags ?? [],
      table_of_contents: input.tableOfContents ?? [],
      preview_content: input.previewContent ?? null,
      pages: input.pages ?? 10,
      is_premium: input.isPremium ?? false,
      author_id: ownerEmail,
      /* 예전엔 author_label 을 아예 안 넣었다. 호출부가 넘긴 값을 받아 놓고
         버려서, 등록에 성공해도 공개 목록의 작성자 자리는 늘 비어 있었다. */
      author_label: label,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

/** 소유자 이메일로 수정 권한 확인 후 수정 */
/** 소유자 이메일로 수정 권한 확인 후 수정 */
export async function updateReport(id: string, input: Partial<{
  title: string;
  subtitle: string;
  category: string;
  region: string;
  price: number;
  tags: string[];
  tableOfContents: string[];
  previewContent: string;
  pages: number;
  isPremium: boolean;
}>, ownerEmail?: string): Promise<UserReport | null> {
  const sb = getServiceSupabase();
  const owner = normEmailOrNull(ownerEmail);
  if (!sb) {
    const r = memory.find((x) => x.id === id);
    if (!r) return null;
    if (owner && r.authorId !== owner) return null;
    Object.assign(r, input, { updatedAt: new Date().toISOString() });
    return r;
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
  if (input.category !== undefined) patch.category = input.category;
  if (input.region !== undefined) patch.region = input.region;
  if (input.price !== undefined) patch.price = input.price;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.tableOfContents !== undefined) patch.table_of_contents = input.tableOfContents;
  if (input.previewContent !== undefined) patch.preview_content = input.previewContent;
  if (input.pages !== undefined) patch.pages = input.pages;
  if (input.isPremium !== undefined) patch.is_premium = input.isPremium;
  let q = sb.from("reports").update(patch).eq("id", id);
  if (owner) q = q.eq("author_id", owner);
  const { data, error } = await q.select().maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function deleteReport(id: string, ownerEmail?: string): Promise<void> {
  const sb = getServiceSupabase();
  const owner = normEmailOrNull(ownerEmail);
  if (!sb) {
    const i = memory.findIndex((x) => x.id === id && (!owner || x.authorId === owner));
    if (i >= 0) memory.splice(i, 1);
    return;
  }
  let q = sb.from("reports").delete().eq("id", id);
  if (owner) q = q.eq("author_id", owner);
  await q;
}

function mapRow(r: Record<string, unknown>): UserReport {
  return {
    id: r.id as string,
    authorId: (r.author_id as string | null) ?? null,
    authorEmail: (r.author_id as string | null) ?? null,
    authorLabel: (r.author_label as string | null) ?? null,
    title: r.title as string,
    subtitle: (r.subtitle as string | null) ?? null,
    category: r.category as string,
    region: (r.region as string | null) ?? null,
    price: Number(r.price ?? 0),
    originalPrice: Number(r.original_price ?? 0),
    tags: (r.tags as string[]) ?? [],
    tableOfContents: (r.table_of_contents as string[]) ?? [],
    previewContent: (r.preview_content as string | null) ?? null,
    rating: Number(r.rating ?? 0),
    reviews: Number(r.reviews ?? 0),
    downloads: Number(r.downloads ?? 0),
    views: Number(r.views ?? 0),
    pages: Number(r.pages ?? 0),
    isPremium: Boolean(r.is_premium),
    gradient: (r.gradient as string | null) ?? null,
    publishedAt: r.published_at as string,
    updatedAt: r.updated_at as string,
  };
}
