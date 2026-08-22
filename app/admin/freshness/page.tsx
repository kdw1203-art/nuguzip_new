import { loadSourceFreshness } from "@/lib/admin/source-freshness";
import { loadNewsRegionLinkage } from "@/lib/admin/news-region-link";

/* [개선 #24] 데이터 신선도 대시보드 — 소스별 마지막 적재와 임계.
   입주물량 한 달 정지를 아무도 몰랐던 사각지대의 해소 화면. 판정은
   lib/admin/data-freshness 단일층 — /api/cron/freshness-watch 감시와 동일. */

export const dynamic = "force-dynamic";

function fmt(iso: string | null): string {
  if (!iso) return "확인 불가";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function age(h: number | null): string {
  if (h === null) return "—";
  if (h < 48) return `${Math.round(h)}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

export default async function AdminFreshnessPage() {
  const [rows, linkage] = await Promise.all([
    loadSourceFreshness(),
    loadNewsRegionLinkage(),
  ]);
  const staleCount = rows.filter((r) => r.stale).length;
  const linkPct =
    linkage && linkage.total > 0 ? Math.round((linkage.linked / linkage.total) * 100) : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-extrabold text-ink">데이터 신선도</h1>
        <p className="mt-1 text-[13px] text-text-2">
          소스별 마지막 적재 시각 — 임계를 넘기면 freshness-watch 크론(매일)이 오류
          로그로 승격합니다.{" "}
          {staleCount > 0 ? (
            <b className="text-danger">지금 {staleCount}개 소스가 임계 초과.</b>
          ) : (
            <b className="text-success">전 소스 정상.</b>
          )}
        </p>
      </div>

      <div className="card overflow-x-auto rounded-2xl px-4 py-2">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-text-3">
              <th className="py-2 pr-3 font-semibold">소스</th>
              <th className="py-2 pr-3 font-semibold">마지막 적재</th>
              <th className="py-2 pr-3 font-semibold">경과</th>
              <th className="py-2 pr-3 font-semibold">임계</th>
              <th className="py-2 font-semibold">갱신 경로</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-[#f0f3f8] last:border-0">
                <td className="py-2.5 pr-3">
                  <span
                    className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${
                      r.stale ? "bg-danger" : "bg-success"
                    }`}
                  />
                  <span className="font-bold text-ink">{r.label}</span>
                </td>
                <td className="py-2.5 pr-3 tabular-nums text-text-1">{fmt(r.lastAt)}</td>
                <td className={`py-2.5 pr-3 font-bold ${r.stale ? "text-danger" : "text-text-1"}`}>
                  {age(r.ageHours)}
                </td>
                <td className="py-2.5 pr-3 text-text-3">
                  {r.thresholdHours >= 48 ? `${Math.round(r.thresholdHours / 24)}일` : `${r.thresholdHours}시간`}
                </td>
                <td className="py-2.5 text-[11.5px] leading-[1.5] text-text-3">{r.pipeline}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* [개선 #19] 뉴스→지역 연결률 — 자동수집 글의 region 이 지역 허브로 풀리는 비율.
          미매핑 상위 값은 카탈로그 보강 또는 수집 단계 region 정규화의 작업 목록이 된다. */}
      {linkage && linkPct !== null && (
        <div className="card rounded-2xl px-4 py-3.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[13px] font-extrabold text-ink">뉴스→지역 연결률</span>
            <span
              className={`text-[20px] font-extrabold tabular-nums ${
                linkPct >= 80 ? "text-success" : linkPct >= 50 ? "text-ink" : "text-danger"
              }`}
            >
              {linkPct}%
            </span>
            <span className="text-[11.5px] text-text-3">
              자동수집 {linkage.total.toLocaleString("ko-KR")}건 중{" "}
              {linkage.linked.toLocaleString("ko-KR")}건이 지역 허브로 연결
            </span>
          </div>
          {linkage.topUnlinked.length > 0 && (
            <p className="mt-1.5 text-[11.5px] leading-[1.7] text-text-3">
              미매핑 상위:{" "}
              {linkage.topUnlinked
                .map((u) => `${u.region} ${u.count.toLocaleString("ko-KR")}건`)
                .join(" · ")}{" "}
              — 지역 카탈로그에 없는 표기입니다. 수집 단계에서 region 값을 시군구
              표기로 정규화하거나 카탈로그를 보강하면 연결률이 오릅니다.
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] leading-[1.7] text-text-3">
        빨간 소스를 발견하면: 갱신 경로 열의 크론·워크플로를 먼저 확인하고, 키 미설정
        (정비사업 SEOUL_OPENAPI_KEY 등)이면 키 발급이 해법입니다. 이 표는 요청 시점
        실측이라 새로고침이 곧 재검사예요.
      </p>
    </div>
  );
}
