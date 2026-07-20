import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { fetchOnbidList, isOnbidConfigured } from "@/lib/onbid/client";
import { logger } from "@/lib/log";

/**
 * 온비드 서울권 부동산 공매 물건 → onbid_auctions 적재.
 * 여러 페이지를 돌며 서울 소재 물건만 upsert. 미설정·실패 시 skipped.
 */

function num(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function fnum(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type OnbidSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  inserted?: number;
};

export async function syncOnbidSeoul(
  opts: { maxPages?: number; sido?: string } = {},
): Promise<OnbidSyncResult> {
  if (!isOnbidConfigured()) {
    return { ok: false, skipped: true, reason: "ONBID_SERVICE_KEY 미설정" };
  }
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, skipped: true, reason: "Supabase 미설정" };

  const sido = opts.sido ?? "서울특별시";
  const maxPages = opts.maxPages ?? 5;
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await fetchOnbidList({ sido, pageNo: page, numOfRows: 100 });
    if (!res || res.items.length === 0) break;
    for (const it of res.items) {
      const key =
        `${it.cltrMngNo ?? ""}-${it.pbctCdtnNo ?? ""}`.trim() || it.onbidCltrno;
      if (!key) continue;
      rows.push({
        external_key: key,
        cltr_mng_no: it.cltrMngNo ?? null,
        pbct_cdtn_no: it.pbctCdtnNo ?? null,
        onbid_cltrno: it.onbidCltrno ?? null,
        pbct_no: it.pbctNo ?? null,
        name: it.onbidCltrNm ?? null,
        prpt_div: it.prptDivNm ?? null,
        usage_mcls: it.cltrUsgMclsCtgrNm ?? null,
        usage_scls: it.cltrUsgSclsCtgrNm ?? null,
        sido: it.lctnSdnm ?? null,
        sigungu: it.lctnSggnm ?? null,
        emd: it.lctnEmdNm ?? null,
        appraisal_krw: num(it.apslEvlAmt),
        min_bid_krw: num(it.lowstBidPrcIndctCont),
        min_bid_text: it.lowstBidPrcIndctCont ?? null,
        land_sqms: fnum(it.landSqms),
        bld_sqms: fnum(it.bldSqms),
        bid_begin: it.cltrBidBgngDt ?? null,
        bid_end: it.cltrBidEndDt ?? null,
        status: it.pbctStatNm ?? null,
        thumb_url: it.thnlImgUrlAdr ?? null,
        updated_at: new Date().toISOString(),
      });
    }
    if (res.items.length < 100) break;
  }

  if (rows.length === 0) {
    return { ok: true, inserted: 0 };
  }
  const { error } = await sb
    .from("onbid_auctions")
    .upsert(rows, { onConflict: "external_key" });
  if (error) {
    logger.error("[onbid sync] upsert failed", error);
    return { ok: false, reason: error.message };
  }
  return { ok: true, inserted: rows.length };
}
