/**
 * 유료 리포트 구매 기록.
 *
 * 이 파일의 조회는 **실패하면 던진다.** 특히 hasPurchased 가 그렇다 —
 * 예전에는 error 를 받지 않아 조회 실패가 그대로 `false`, 즉 "이 사람은 아직
 * 안 샀다"는 사실이 됐다. 그 답을 받은 화면은 이미 결제한 사람에게 결제창을
 * 다시 띄운다. 조회가 잠깐 밀린 대가로 같은 리포트를 두 번 결제하게 되는 길이라,
 * 여기서만은 "모르겠다"를 "안 샀다"로 바꾸면 안 된다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

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
  if (!sb) throw new Error("report_purchases 조회 실패: Supabase 미설정");
  const { data, error } = await sb
    .from("report_purchases")
    .select("id")
    .eq("report_id", reportId)
    .eq("user_email", userEmail)
    .maybeSingle();
  /* 행이 없으면 error 없이 data=null 이다 — 그 null 만 "아직 안 샀다"이다. */
  if (error) throw new Error(`report_purchases 조회 실패: ${error.message}`);
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

  /* 리포트 downloads 증가 — 구매는 이미 저장됐으므로 여기서 실패해도 되돌리지
     않는다. 다만 예전의 try/catch 는 한 번도 실행된 적이 없다: Supabase 쿼리
     빌더는 예외를 던지지 않고 { error } 를 돌려준다. 이제는 기록이라도 남긴다. */
  const { error: rpcError } = await sb.rpc("increment_report_downloads", {
    p_report_id: input.reportId,
  });
  if (rpcError) {
    logger.error("[report-purchases] increment_report_downloads 실패:", rpcError.message);
    const { data: r, error: readError } = await sb
      .from("reports")
      .select("downloads")
      .eq("id", input.reportId)
      .maybeSingle();
    if (readError) {
      logger.error("[report-purchases] downloads 조회 실패:", readError.message);
    } else if (r) {
      const { error: bumpError } = await sb
        .from("reports")
        .update({ downloads: (r.downloads as number) + 1 })
        .eq("id", input.reportId);
      if (bumpError) {
        logger.error("[report-purchases] downloads 증가 실패:", bumpError.message);
      }
    }
  }

  return mapRow(data as Record<string, unknown>);
}

export async function listMyPurchases(userEmail: string): Promise<ReportPurchase[]> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("report_purchases 조회 실패: Supabase 미설정");
  const { data, error } = await sb
    .from("report_purchases")
    .select("*")
    .eq("user_email", userEmail)
    .order("purchased_at", { ascending: false });
  if (error) throw new Error(`report_purchases 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("report_purchases 조회 실패: 응답이 배열이 아닙니다");
  return data.map(mapRow);
}
