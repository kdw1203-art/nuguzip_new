import { getServiceSupabase } from "@/lib/supabase/service";

export interface ComplexReview {
  id: string;
  complexId: string;
  complexName: string;
  authorEmail: string;
  noiseScore: number;
  parkingScore: number;
  mgmtScore: number;
  neighborScore: number;
  transportScore: number;
  comment: string | null;
  createdAt: string;
}

export interface ReviewSummary {
  count: number;
  avgNoise: number;
  avgParking: number;
  avgMgmt: number;
  avgNeighbor: number;
  avgTransport: number;
  overall: number;
}

const inMemory: ComplexReview[] = [];

function dbToReview(r: Record<string, unknown>): ComplexReview {
  return {
    id: String(r.id),
    complexId: String(r.complex_id),
    complexName: String(r.complex_name),
    authorEmail: String(r.author_email),
    noiseScore: Number(r.noise_score),
    parkingScore: Number(r.parking_score),
    mgmtScore: Number(r.mgmt_score),
    neighborScore: Number(r.neighbor_score),
    transportScore: Number(r.transport_score),
    comment: r.comment ? String(r.comment) : null,
    createdAt: String(r.created_at),
  };
}

export async function listReviews(complexId: string): Promise<ComplexReview[]> {
  const sb = getServiceSupabase();
  if (!sb) return inMemory.filter((r) => r.complexId === complexId);
  const { data } = await sb
    .from("complex_reviews")
    .select("*")
    .eq("complex_id", complexId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(dbToReview);
}

export async function upsertReview(
  review: Omit<ComplexReview, "id" | "createdAt">,
): Promise<ComplexReview> {
  const now = new Date().toISOString();
  const sb = getServiceSupabase();
  if (!sb) {
    const existing = inMemory.findIndex(
      (r) => r.complexId === review.complexId && r.authorEmail === review.authorEmail,
    );
    const entry: ComplexReview = { ...review, id: `mem-${Date.now()}`, createdAt: now };
    if (existing >= 0) inMemory[existing] = entry;
    else inMemory.unshift(entry);
    return entry;
  }
  const { data, error } = await sb
    .from("complex_reviews")
    .upsert(
      {
        complex_id: review.complexId,
        complex_name: review.complexName,
        author_email: review.authorEmail,
        noise_score: review.noiseScore,
        parking_score: review.parkingScore,
        mgmt_score: review.mgmtScore,
        neighbor_score: review.neighborScore,
        transport_score: review.transportScore,
        comment: review.comment,
        updated_at: now,
      },
      { onConflict: "complex_id,author_email" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return dbToReview(data as Record<string, unknown>);
}

export function calcSummary(reviews: ComplexReview[]): ReviewSummary {
  if (!reviews.length) return { count: 0, avgNoise: 0, avgParking: 0, avgMgmt: 0, avgNeighbor: 0, avgTransport: 0, overall: 0 };
  const avg = (key: keyof ComplexReview) =>
    reviews.reduce((s, r) => s + (r[key] as number), 0) / reviews.length;
  const avgNoise = avg("noiseScore");
  const avgParking = avg("parkingScore");
  const avgMgmt = avg("mgmtScore");
  const avgNeighbor = avg("neighborScore");
  const avgTransport = avg("transportScore");
  const overall = (avgNoise + avgParking + avgMgmt + avgNeighbor + avgTransport) / 5;
  return { count: reviews.length, avgNoise, avgParking, avgMgmt, avgNeighbor, avgTransport, overall };
}
