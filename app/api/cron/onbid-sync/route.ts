import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { isOnbidConfigured } from "@/lib/onbid/client";
import { syncOnbidSeoul } from "@/lib/onbid/sync";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 온비드 서울권 부동산 공매 물건 동기화 크론.
 * 보호: CRON_SECRET 또는 관리자 세션. 키 없으면 skipped(정상 폴백).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  if (!isOnbidConfigured()) {
    await logIngest({
      source: "onbid",
      dataset: "온비드 공매 물건",
      origin: "cron-fetch",
      rows: 0,
      status: "skipped",
      message: "ONBID_SERVICE_KEY 미설정",
    });
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: "ONBID_SERVICE_KEY 미설정 — 설정 시 서울권 공매 물건이 자동 적재됩니다.",
    });
  }
  // 디버그: 원문 응답 앞부분 확인 (?debug=1)
  if (url.searchParams.get("debug") === "1") {
    const key = process.env.ONBID_SERVICE_KEY!.trim();
    const p = new URLSearchParams({
      serviceKey: key,
      resultType: "json",
      pageNo: "1",
      numOfRows: "3",
      prptDivCd: "0007",
      pvctTrgtYn: "N",
      lctnSdnm: "서울특별시",
    });
    try {
      const r = await fetch(
        `https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2?${p.toString()}`,
        { signal: AbortSignal.timeout(20000) },
      );
      const t = await r.text();
      return NextResponse.json({ status: r.status, head: t.slice(0, 900) });
    } catch (e) {
      return NextResponse.json({ error: String(e) });
    }
  }
  const sido = url.searchParams.get("sido")?.trim() || undefined;
  const maxPages = Number(url.searchParams.get("pages") ?? "5") || 5;
  /* [941] 수도권 확대 — sido 를 명시하지 않으면 서울·경기·인천을 순서대로 돈다.
     지도 공매 배지(경기·인천 좌표 카탈로그)와 매칭 코드는 937부터 준비돼 있었고
     데이터만 서울뿐이었다. 시도당 최대 pages 페이지 × 100건, 순차 실행이라
     maxDuration(120s) 안에서 넉넉하다. 부분 실패는 시도별로 기록하고 계속 간다. */
  const sidos = sido
    ? [sido]
    : ["서울특별시", "경기도", "인천광역시", "부산광역시", "대구광역시", "대전광역시", "광주광역시", "울산광역시"]; // [945] 전국 확장 1차
  const dataset = `온비드 공매 물건 (${sidos.join("·")})`;
  // F3(#147) — 던져서 끝나면 로그가 비어 "안 돌았다"와 구분되지 않으므로 예외도 기록한다.
  try {
    let inserted = 0;
    const parts: string[] = [];
    let anyOk = false;
    let allSkipped = true;
    for (const s of sidos) {
      try {
        const r = await syncOnbidSeoul({ sido: s, maxPages });
        inserted += r.inserted ?? 0;
        anyOk = anyOk || r.ok;
        allSkipped = allSkipped && Boolean(r.skipped);
        parts.push(`${s} ${r.ok ? (r.inserted ?? 0) : `실패(${r.reason ?? "?"})`}`);
      } catch (e) {
        allSkipped = false;
        parts.push(`${s} 실패(${ingestErrorMessage(e, "동기화 예외")})`);
      }
    }
    const result = {
      ok: anyOk,
      skipped: allSkipped || undefined,
      inserted,
      bySido: parts.join(" · "),
    };
    await logIngest({
      source: "onbid",
      dataset,
      origin: "cron-fetch",
      rows: inserted,
      status: anyOk ? "ok" : allSkipped ? "skipped" : "error",
      message: parts.join(" · "),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = ingestErrorMessage(err, "온비드 동기화 실패");
    await logIngest({
      source: "onbid",
      dataset,
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
