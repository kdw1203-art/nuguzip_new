import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { listPartnersAll } from "@/lib/dev-deals/store";
import { seoAlternates } from "@/lib/seo/alternates";
import { PartnersClient } from "./PartnersClient";

/* ── ISR 전환 (사용량 절감 10차, 2026-08-10) ────────────────────────────────
   예전에는 force-dynamic + ?type= 서버 필터(요청마다 함수 실행 + DB 쿼리)였다.
   실측: dev_partners 전체 1행(실등록 0) — 페치 상한 120 안에 넉넉히 들어오므로
   클라이언트 메모리 필터가 서버 .eq 필터와 동치다. 필터는 PartnersClient 가
   마운트 후 location.search 로 처리하고, SSR 은 전량을 그대로 그린다.
   dev_partners 는 anon SELECT 가 없어 service-role 의존이다 — 그 부류의 실패는
   health.privilegedRead 가 감시하고, 이 페이지는 실패를 빈 상태("아직 없어요")로
   캐시하지 않도록 ok 판별로 구별해 그린다(dev-deals 본판과 같은 교훈). */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "협력업체 디렉터리 · 개발물건 중개 · 누구집",
  description:
    "시공사·설계사·신탁·PF·마케팅·감리 등 개발사업 협력업체를 찾고, 우리 회사를 등록해 개발물건 매칭을 받아 보세요.",
  robots: { index: true, follow: true },
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/dev-deals/partners"),
};

const DISCLAIMER =
  "누구집은 개발물건의 소개·매칭 플랫폼으로, 당사자 간 계약·자금 정산에 관여하지 않습니다. 게시 정보의 정확성은 등록자에게 있으며, 실제 거래·인허가·수수료 약정은 반드시 당사자 간 확인 및 전문가(법무·세무·공인중개사 등) 자문을 거치시기 바랍니다. 표기된 중개 수수료는 기준이며 사업 규모·조건에 따라 협의됩니다.";

export default async function DevPartnersPage() {
  const loaded = await listPartnersAll();

  return (
    <PageShell breadcrumb="홈 › 개발물건 중개 › 협력업체" title="협력업체 디렉터리">
      <p className="rise-in mb-4 text-[13px] leading-[1.7] text-text-2">
        시공사·설계사·신탁·PF·마케팅·감리 등 개발사업 <strong className="text-ink">협력업체</strong>를 찾아보세요.
        우리 회사를 등록하면 조건에 맞는 <strong className="text-ink">개발물건 매칭</strong>과 참여 기회를 받을 수
        있어요.
      </p>

      <section className="rise-in-1 mb-4 flex flex-wrap gap-2">
        <Link href="/dev-deals/partners/new" className="btn-primary btn-md no-underline">
          협력업체 등록
        </Link>
        <Link href="/dev-deals" className="btn-outline btn-md no-underline">
          개발물건 보기
        </Link>
      </section>

      {loaded.ok ? (
        <PartnersClient partners={loaded.items} truncated={loaded.truncated} />
      ) : (
        /* 조회 실패 — "아직 없어요"(빈 상태)와 구별한다. 0건인 게 아니라 조회 실패다. */
        <section className="rise-in-2 card p-[var(--pad-card)]">
          <div className="rounded-[12px] border border-line bg-surface px-4 py-10 text-center text-[13px] text-text-2">
            협력업체 목록을 불러오지 못했어요. 등록이 없는 게 아니라 조회에
            실패한 것이니, 잠시 뒤 새로고침해 주세요.
          </div>
        </section>
      )}

      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        {DISCLAIMER}
      </div>
    </PageShell>
  );
}
