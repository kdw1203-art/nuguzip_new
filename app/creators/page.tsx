import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { Icon } from "@/app/components/Icon";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { getBusinessInfo } from "@/lib/brand/business-info";

/* ============================================================
   크리에이터 입점 안내 — /creators (성장 전략 U4, docs/strategy/unfair-advantage.md)

   임장 콘텐츠 크리에이터를 모으는 아웃바운드 랜딩. 소유자가 섭외 DM 에
   이 링크 하나를 보내는 용도가 1순위, 자료실 유입의 판매 전환이 2순위.

   사실 규율(심사 확약과 동일 기준):
   - 수익 보장·수익 전망 문구 금지 (회신 확약: 수익문구 영구 미기재)
   - 판매 보상은 포인트 적립이 사실 전부 — 현금 전환·출금은 없고 도입하지 않는다(2026-08-23 토스 회신 반영)
   - 요율 숫자는 여기 복제하지 않는다(드리프트 방지) — /legal/fees 단일 원천
   ============================================================ */

export const metadata = buildPageMetadata({
  title: "임장 크리에이터 입점 안내",
  description:
    "임장·지역 분석 리포트를 내집나우 자료실에서 판매하는 크리에이터 입점 안내. 노트 작성부터 리포트 판매까지의 절차와 보상 방식을 사실대로 안내합니다.",
  path: "/creators",
});

const WHY = [
  {
    icon: "footprints" as const,
    title: "비어 있는 칸의 첫 자리",
    desc: "임장·지역 분석 콘텐츠를 파는 전용 마켓은 아직 없습니다. 영상 조회수로 흘려보내던 답사 기록이 여기서는 계속 팔리는 재고가 됩니다.",
  },
  {
    icon: "eye" as const,
    title: "읽으러 온 독자가 아니라, 사러 온 독자",
    desc: "내집나우 방문자는 실거래가를 확인하고 임장을 준비하러 온 사람들입니다. 그 지역 리포트가 필요한 순간의 독자에게 바로 닿습니다.",
  },
  {
    icon: "rocket" as const,
    title: "초기 입점 우대",
    desc: "초기 입점 크리에이터에게 수수료 우대 프로모션을 운영합니다. 등급·기간별 요율은 수수료 안내에서 그대로 확인할 수 있습니다.",
  },
];

const STEPS = [
  {
    no: "1",
    title: "임장노트를 쓰고 공개",
    desc: "현장에서 기록한 노트를 공개로 전환하면 단지·지역 페이지와 검색에 연결됩니다.",
  },
  {
    no: "2",
    title: "크리에이터 센터에서 리포트로 승격",
    desc: "공개 노트를 골라 유료 리포트로 만들고 가격을 직접 정합니다.",
  },
  {
    no: "3",
    title: "자료실·검색에서 판매",
    desc: "리포트는 자료실과 검색에 노출되고, 구매자는 열람권을 얻습니다. 판매 실적은 크리에이터 센터에서 실시간 확인합니다.",
  },
];

const FAQ = [
  {
    q: "누가 입점할 수 있나요?",
    a: "내집나우 계정이 있으면 누구나 리포트를 등록할 수 있습니다. 본인·자격 인증을 마친 판매자와 전문가 구독 회원은 우대 요율이 적용됩니다.",
  },
  {
    q: "무엇을 팔 수 있나요?",
    a: "본인이 직접 작성한 임장 기록·지역 분석 리포트입니다. 타인 저작물, 무단 전재, 출처 없는 수치가 담긴 자료는 게시가 제한됩니다.",
  },
  {
    q: "판매 보상은 어떻게 받나요?",
    a: "판매 보상은 포인트(P)로 적립되며, 수수료율은 수수료 안내 페이지의 공표 요율을 따릅니다. 포인트는 현금으로 전환·출금되지 않으며, 매물 상단 노출·꾸미기 등 서비스 내 혜택에만 사용할 수 있습니다.",
  },
];

export default function CreatorsPage() {
  const { supportEmail } = getBusinessInfo();
  return (
    <PageShell breadcrumb="홈 › 크리에이터 입점">
      {/* 히어로 — 수익 보장·전망 없이, 구조만 말한다 */}
      <div className="mb-7 max-w-[720px]">
        <h1 className="rise-in text-[24px] font-extrabold leading-[1.35] text-ink">
          임장 콘텐츠, 조회수로 끝내지 마세요
        </h1>
        <p className="mt-2 text-[14px] leading-[1.7] text-text-2">
          발로 뛰어 만든 지역 분석과 임장 기록을 내집나우 자료실에서 리포트로
          판매할 수 있습니다. 한 번 만든 콘텐츠가 그 지역을 검색하는 다음
          사람에게 계속 팔리는 구조입니다. 수익을 약속하지는 않습니다 —
          대신 구조와 요율을 전부 공개합니다.
        </p>
      </div>

      {/* 왜 내집나우인가 */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {WHY.map((w) => (
          <div key={w.title} className="card rounded-2xl px-4 py-4">
            <Icon name={w.icon} size={20} className="text-primary" />
            <div className="mt-2 text-[14px] font-extrabold text-ink">{w.title}</div>
            <p className="mt-1 text-[12.5px] leading-[1.65] text-text-2">{w.desc}</p>
          </div>
        ))}
      </div>

      {/* 판매까지 3단계 */}
      <h2 className="mb-3 text-[16px] font-extrabold text-ink">판매까지 3단계</h2>
      <ol className="mb-8 grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.no} className="card flex gap-3 rounded-2xl px-4 py-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-extrabold text-primary">
              {s.no}
            </span>
            <div>
              <div className="text-[13.5px] font-extrabold text-ink">{s.title}</div>
              <p className="mt-0.5 text-[12.5px] leading-[1.6] text-text-2">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* 사실 고지 — 이 정직함이 브랜드다 */}
      <div className="mb-8 max-w-[720px] rounded-2xl border border-line bg-[#f7f9fc] px-4 py-3.5">
        <div className="text-[12.5px] font-extrabold text-ink">있는 그대로의 고지</div>
        <ul className="mt-1.5 flex flex-col gap-1 text-[12px] leading-[1.65] text-text-2">
          <li>· 판매 수익 규모는 보장하지도, 전망으로 제시하지도 않습니다.</li>
          <li>
            · 판매 보상은 포인트(P) 적립이며, 포인트는 현금으로 전환·출금되지
            않습니다(서비스 내 혜택 전용).
          </li>
          <li>
            · 수수료는{" "}
            <Link href="/legal/fees" className="font-bold text-primary underline underline-offset-2">
              거래·수수료 안내
            </Link>
            의 공표 요율만 적용됩니다 — 이 페이지에 별도 요율은 없습니다.
          </li>
        </ul>
      </div>

      {/* FAQ */}
      <h2 className="mb-3 text-[16px] font-extrabold text-ink">자주 묻는 것</h2>
      <div className="mb-8 flex max-w-[720px] flex-col gap-3">
        {FAQ.map((f) => (
          <div key={f.q} className="card rounded-2xl px-4 py-3.5">
            <div className="text-[13.5px] font-extrabold text-ink">{f.q}</div>
            <p className="mt-1 text-[12.5px] leading-[1.65] text-text-2">{f.a}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Link href="/my/creator" className="btn-primary press rounded-xl px-5 py-2.5 text-[13.5px]">
          크리에이터 센터에서 시작 ›
        </Link>
        <Link
          href="/town/library"
          className="chip bg-surface px-4 py-2.5 text-[13px] font-bold text-text-2 shadow-sm"
        >
          자료실 둘러보기
        </Link>
      </div>
      <p className="text-[12px] text-text-3">
        입점·제휴 문의: <span className="font-semibold">{supportEmail}</span>
      </p>
    </PageShell>
  );
}
