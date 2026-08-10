import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { PageShell } from "../components/PageShell";
import { listDeals } from "@/lib/dev-deals/store";
import { type DevDeal } from "@/lib/dev-deals/types";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";
import { DevDealsListClient } from "./DevDealsListClient";

/* [2026-08-10 저녁 재전환] 필터는 DevDealsListClient(클라이언트), DB 왕복 1회.
   낮에 ISR 로 갔다가 되돌렸었다 — 프로덕션 서비스롤 키가 유실돼(Pro 재임포트)
   dev_deals(anon GRANT 없음) 조회 실패가 5분 캐시에 눌러앉았기 때문. 소유자가
   키를 복구했고 실측으로 확인했다(목록 정상 + anon GRANT 는 여전히 닫힘).
   같은 부류 재발은 /api/health 의 privilegedRead 체크가 이제 degraded 로 잡는다
   — 실패가 또 캐시되더라도 5분 안에 헬스가 울린다. */
export const revalidate = 300;
export function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  title: "개발물건 중개 · 누구집",
  description:
    "시행사·부동산사업자가 개발물건(정비사업·신축·부지)을 등록하면 시공사·설계사·신탁·PF 등 협력업체가 참여 문의를 보내는 B2B 디벨로퍼 매칭. 누구집은 소개·중개(매칭)만 담당합니다.",
  robots: { index: true, follow: true },
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/dev-deals"),
};

/** 테마 구분: 개발물건 중개 = 앰버(디벨로퍼 매칭). 하위 클래스(text-primary·
 *  bg-primary-soft·chip-active·btn-primary·btn-outline)가 이 subtree 안에서
 *  앰버로 재테마된다. 강한 앰버 텍스트는 var(--primary-strong)로 직접 지정. */
const DEV_THEME = {
  "--primary": "#d97706",
  "--primary-soft": "#fdf1df",
  "--primary-strong": "#b45309",
} as CSSProperties;

const DISCLAIMER =
  "누구집은 개발물건의 소개·매칭 플랫폼으로, 당사자 간 계약·자금 정산에 관여하지 않습니다. 게시 정보의 정확성은 등록자에게 있으며, 실제 거래·인허가·수수료 약정은 반드시 당사자 간 확인 및 전문가(법무·세무·공인중개사 등) 자문을 거치시기 바랍니다. 표기된 중개 수수료는 기준이며 사업 규모·조건에 따라 협의됩니다.";

/** 등록 물건이 0건일 때 레이아웃을 보여주기 위한 예시 카드용 더미(예시 배지 표시) */
const EXAMPLE_DEAL: DevDeal = {
  id: "example",
  ownerEmail: null,
  title: "○○구 가로주택정비사업 — 시공·설계·신탁·PF 협력사 모집",
  dealType: "가로주택정비",
  region: "서울 성북",
  address: null,
  landAreaM2: 3200,
  grossFloorAreaM2: 11800,
  units: 168,
  totalCostKrw: 42000000000,
  neededPartners: ["시공", "설계", "신탁", "PF"],
  budgetText: null,
  summary:
    "노후 저층주거지 가로주택정비 — 조합 설립 완료. 시공·설계·신탁·PF 협력사를 찾습니다.",
  description: null,
  contactName: "김담당",
  contactMasked: "010-****-1234",
  status: "open",
  isVerified: false,
  isSample: true,
  viewCount: 0,
  inquiryCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: null,
};

export default async function DevDealsHubPage() {
  /* 2026-07-26: store 가 실패 때 `[]` 를 돌려주던 걸 던지도록 고쳤다. 여기서
     받아서 "지금 불러오지 못했다"고 말한다 — 등록된 개발물건이 0건인 것과
     조회가 죽은 것은 다른 사실이다. */
  const loaded = await listDeals({}).then(
    (all) => ({ ok: true as const, all }),
    (err: unknown) => {
      logger.error("[dev-deals] 개발물건 목록 조회 실패", err);
      return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
    },
  );

  /* 조회 실패가 페이지 전체를 삼키지 않게 한다 (2026-08-02).
     예전에는 여기서 ErrorState 만 그리고 일찍 반환했는데, 그러면 목록과 무관한
     정적 허브(역할 안내·매칭 3단계·수수료 링크·"개발물건 등록" CTA)까지 통째로
     사라졌다 — 등록하러 온 시행사가 DB 장애 화면만 보고 돌아간다. 실패는
     **목록 섹션에만** 표시하고, 건수 요약도 "0건"이 아니라 "조회 실패"로 적는다. */
  const loadFailed = !loaded.ok;
  const all = loaded.ok ? loaded.all : [];

  // 지역 필터 옵션 — 전체 목록에서 유니크 추출(클라이언트 필터 화이트리스트로도 쓰인다)
  const regions = Array.from(
    new Set(all.map((d) => d.region).filter((r): r is string => !!r)),
  ).sort();

  return (
    <PageShell breadcrumb="동네이야기 › 개발물건 중개" wide>
      <div style={DEV_THEME}>
        {/* 헤더 · 역할 요약(면책 취지 포함) */}
        <div className="rise-in mb-4">
          <h1 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[19px] font-extrabold leading-[1.3] text-ink md:text-[21px]">
            개발물건 중개
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[12px] font-bold text-primary">
              B2B 디벨로퍼 매칭
            </span>
          </h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-[1.7] text-text-2">
            시행사·개발을 원하는 부동산사업자가 <strong className="text-ink">개발물건</strong>
            (정비사업·신축·부지 등)을 등록하면,{" "}
            <strong className="text-ink">시공사·설계사·신탁·PF·기타 협력업체</strong>가 이를 발견해
            참여 문의·제안을 보냅니다. 누구집은 양측을 이어주는{" "}
            <strong className="text-ink">소개·중개(매칭)</strong> 역할만 하며{" "}
            <strong className="text-ink">결제·정산은 진행하지 않습니다</strong> — 실제 계약·정산은
            당사자 간 오프라인으로 진행됩니다.
          </p>
        </div>

        {/* 역할·출처 안내 배너(앰버 틴트) */}
        <div
          className="rise-in mb-4 flex items-start gap-2 rounded-xl bg-primary-soft px-4 py-3 text-[12px] leading-[1.6]"
          style={{ color: "var(--primary-strong)" }}
        >
          <span className="mt-px shrink-0 rounded-full bg-white/70 chip-pad text-[10px] font-extrabold">
            안내
          </span>
          <span>
            누구집은 개발물건 <strong>소개·매칭 플랫폼</strong>이에요. 게시 정보의 정확성·거래 책임은
            당사자에게 있으며, <strong>결제·자금 정산은 제공하지 않습니다.</strong> 계약·인허가·수수료
            약정은 반드시 당사자 확인과 전문가 자문을 거치세요.
          </span>
        </div>

        {/* 목록 + 필터는 클라이언트(DevDealsListClient) — 서버 렌더를 필터와
            무관하게 만들어 ISR 한 벌로 재사용한다. 실패는 loadFailed 로 전달해
            빈 결과와 구분한다(예시 카드로 장애를 덮지 않는다). */}
        <DevDealsListClient
          all={all}
          regions={regions}
          exampleDeal={EXAMPLE_DEAL}
          loadFailed={loadFailed}
        />

        {/* 면책 고지(앰버 틴트) */}
        <div
          className="rise-in-4 mt-8 rounded-xl bg-primary-soft px-4 py-3 text-[11px] leading-[1.7]"
          style={{ color: "var(--primary-strong)" }}
        >
          {DISCLAIMER}
        </div>
      </div>
    </PageShell>
  );
}
