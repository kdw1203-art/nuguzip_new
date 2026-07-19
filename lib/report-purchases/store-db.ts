import { getServiceSupabase } from "@/lib/supabase/service";

export type ReportPurchase = {
  id: string;
  reportId: string;
  userEmail: string;
  amount: number;
  paymentId: string | null;
  purchasedAt: string;
};

function mapRow(r: Record<string, unknown>): ReportPurchase {
  return {
    id: String(r.id ?? ""),
    reportId: String(r.report_id ?? ""),
    userEmail: String(r.user_email ?? ""),
    amount: Number(r.amount ?? 0),
    paymentId: r.payment_id ? String(r.payment_id) : null,
    purchasedAt: String(r.purchased_at ?? ""),
  };
}

export async function hasPurchased(reportId: string, userEmail: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { data } = await sb
    .from("report_purchases")
    .select("id")
    .eq("report_id", reportId)
    .eq("user_email", userEmail)
    .maybeSingle();
  return Boolean(data);
}

export async function createPurchase(input: {
  reportId: string;
  userEmail: string;
  amount: number;
  paymentId?: string;
}): Promise<ReportPurchase> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("Supabase 미설정");

  const { data, error } = await sb
    .from("report_purchases")
    .insert({
      report_id: input.reportId,
      user_email: input.userEmail,
      amount: input.amount,
      payment_id: input.paymentId ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // 리포트 downloads 증가
  try {
    await sb.rpc("increment_report_downloads", { p_report_id: input.reportId });
  } catch {
    const { data: r } = await sb.from("reports").select("downloads").eq("id", input.reportId).maybeSingle();
    if (r) {
      await sb.from("reports").update({ downloads: (r.downloads as number) + 1 }).eq("id", input.reportId);
    }
  }

  return mapRow(data as Record<string, unknown>);
}

export async function listMyPurchases(userEmail: string): Promise<ReportPurchase[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("report_purchases")
    .select("*")
    .eq("user_email", userEmail)
    .order("purchased_at", { ascending: false });
  return (data ?? []).map(mapRow);
}
