import { getServiceSupabase } from "@/lib/supabase/service";

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

export async function listReports(): Promise<UserReport[]> {
  const sb = getServiceSupabase();
  if (!sb) return memory;
  const { data, error } = await sb
    .from("reports")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(200);
  if (error) return [];
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
  const rec: UserReport = {
    id: `mem-${Date.now().toString(36)}`,
    authorId: input.authorEmail ?? null,
    authorEmail: input.authorEmail ?? null,
    authorLabel: input.authorLabel ?? null,
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
      author_id: input.authorEmail ?? null,
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
  if (!sb) {
    const r = memory.find((x) => x.id === id);
    if (!r) return null;
    if (ownerEmail && r.authorId && r.authorId !== ownerEmail) return null;
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
  if (ownerEmail) q = q.eq("author_id", ownerEmail);
  const { data, error } = await q.select().maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function deleteReport(id: string, ownerEmail?: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) {
    const i = memory.findIndex((x) => x.id === id && (!ownerEmail || x.authorId === ownerEmail));
    if (i >= 0) memory.splice(i, 1);
    return;
  }
  let q = sb.from("reports").delete().eq("id", id);
  if (ownerEmail) q = q.eq("author_id", ownerEmail);
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
