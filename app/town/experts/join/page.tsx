import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { JsonLd } from "@/app/components/JsonLd";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, faqJsonLd } from "@/lib/seo/jsonld";
import { EXPERT_TYPES } from "@/lib/experts/taxonomy";
import { EXPERT_JOIN_FAQ } from "@/lib/experts/faq";
import { EXPERT_VERIFICATION_PIPELINE, EXPERT_POST_APPROVAL } from "@/lib/experts/verification-policy";
import { EXPERT_CERT_FEES } from "@/lib/billing/marketplace-fees";
import { ExpertApplyCta } from "../ExpertApplyCta";
import { TownCategoryNav } from "../../TownCategoryNav";

/* ============================================================
   전문가 참여 안내 — /town/experts/join  (959)

   왜 따로 있는가: /town/experts 는 **묻는 사람**의 화면이다. 참여할 전문가에게
   보낼 주소(명함·SNS·검색 유입·하우스 광고)가 없어서 홍보가 목록 페이지 하단
   #apply 앵커에 기대고 있었다. 이 화면은 전문가 한 사람이 처음 도착해 "무엇이
   열리고, 누가 되고, 어떻게 확인하고, 얼마가 드는지"를 한 번에 읽고 신청까지
   가는 랜딩이다.

   말의 규칙(전문가 개편 953 과 동일)
    · 숫자는 코드에 있는 것만 — 심사비·수수료(EXPERT_CERT_FEES), 단계·SLA
      (EXPERT_VERIFICATION_PIPELINE), 재검증 주기(EXPERT_POST_APPROVAL).
    · 결제·정산은 아직 플랫폼에서 처리하지 않는다 — "준비 중"이라고 말한다.
      포인트·충전 표현 금지(소유자 방침).
    · 법률 서비스 유형은 정책상 받지 않는다 — 분류 체계에 없고 여기도 없다.
    · 인증 전문가 수·후기 같은 실측은 목록 히어로가 보여 주므로 여기서 지어내지 않는다.
   ============================================================ */

export const metadata = buildPageMetadata({
  title: "전문가로 참여하기 — 공인중개사·세무사·감정평가사·대출상담사·건축사 모집",
  description:
    "자격을 확인한 전문가로 내집나우에 참여하세요. 프로필 노출, 상담 수신·답변, 견적 제안, 의뢰자 후기. 가입 심사비 무료, 서류·협회 조회로 인증합니다.",
  path: "/town/experts/join",
});

const OPENS: readonly { icon: string; title: string; desc: string }[] = [
  {
    icon: "user",
    title: "프로필 노출",
    desc: "전문가 목록·유형 필터·지역 검색에 실리고, 소개·전문 분야·활동 지역·상담료를 직접 관리합니다.",
  },
  {
    icon: "messages-square",
    title: "상담 수신 · 글 답변",
    desc: "의뢰자가 임장노트 링크를 붙여 묻고, 답변은 의뢰자 상담함과 알림으로 전달됩니다.",
  },
  {
    icon: "clipboard",
    title: "견적 요청에 제안",
    desc: "세무·대출·임장 동행·인테리어 요청 보드에 요청당 1건 제안을 보내면 의뢰자가 비교해 찾아옵니다.",
  },
  {
    icon: "star",
    title: "후기 · 응답률",
    desc: "답변 완료 상담의 의뢰자만 후기를 남깁니다. 응답률·답변 시간 중앙값이 프로필에 함께 표시돼요.",
  },
];

const RULES: readonly { icon: string; text: string }[] = [
  { icon: "lock", text: "상담·제안 본문의 전화번호·계좌·외부 메신저·개인 송금 유도는 자동 탐지 → 경고·제한" },
  { icon: "shield", text: "허위 기재·타인 자격번호 사용·신고 누적 시 인증 거부·정지" },
  { icon: "repeat", text: `인증 상태는 ${EXPERT_POST_APPROVAL.revalidationIntervalDays}일마다 공식 출처로 재검증` },
];

function feeRow(label: string): string {
  return EXPERT_CERT_FEES.find((f) => f.label === label)?.rate ?? "—";
}

export default function ExpertJoinPage() {
  const pipeline = EXPERT_VERIFICATION_PIPELINE.filter((s) => s.id !== "rejected" && s.id !== "suspended");
  const verifiable = EXPERT_TYPES.filter((t) => t.id !== "other");
  const other = EXPERT_TYPES.find((t) => t.id === "other");

  return (
    <PageShell breadcrumb="동네이야기 › 전문가 › 참여 안내">
      <JsonLd data={faqJsonLd(EXPERT_JOIN_FAQ)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "동네이야기", url: "/town" },
          { name: "전문가", url: "/town/experts" },
          { name: "참여 안내", url: "/town/experts/join" },
        ])}
      />
      <TownCategoryNav stick />

      {/* ---------- 히어로 (브랜드 네이비) ---------- */}
      <section className="rise-in brand-navy-card mb-5 overflow-hidden rounded-[18px] px-5 py-6 md:px-7 md:py-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[580px]">
            <div className="t-caption font-extrabold tracking-wider text-on-dark-muted">전문가 모집</div>
            <h1 className="mt-1 t-display text-balance text-on-dark">
              자격을 확인한 전문가로, <span className="text-brand-red-dark">지금</span> 참여하세요
            </h1>
            <p className="mt-2 max-w-[52ch] t-body text-on-dark-muted">
              내집나우 이용자는 단지 하나를 정해 실거래·임장노트를 보고 온 사람들입니다. 그 질문에
              글로 답하고, 견적 요청에 제안을 보내고, 답변 완료 의뢰자의 후기를 프로필에 쌓으세요.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 t-sub text-on-dark-muted">
              <span className="inline-flex items-center gap-1">
                <Icon name="check" size={13} className="text-brand-red-dark" /> 가입 심사비 {feeRow("전문가 가입 심사비")}
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="shield" size={13} className="text-on-dark" /> 협회·기관 공개 조회로 인증
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="clock" size={13} className="text-on-dark" /> 1차 자동 검증 24시간
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
            <ExpertApplyCta label="전문가 인증 신청하기" />
            <Link href="/town/experts" className="brand-photo-chip rounded-xl px-5 py-2.5 t-sub font-bold no-underline">
              전문가 목록 보기 ›
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- 인증되면 열리는 것 ---------- */}
      <section className="mb-6">
        <h2 className="mb-3 t-section text-ink">인증되면 열리는 것</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {OPENS.map((o) => (
            <div key={o.title} className="card flex gap-3 rounded-2xl p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-on-dark">
                <Icon name={o.icon} size={20} />
              </span>
              <div className="min-w-0">
                <div className="t-body font-extrabold text-ink">{o.title}</div>
                <p className="mt-0.5 t-sub text-text-2">{o.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 t-caption text-text-3">
          공인중개사는 매물 등록·관리 + 받은 문의(리드) 확인, 상호·등록번호 표시가 추가로 열립니다.
        </p>
      </section>

      {/* ---------- 누가 ---------- */}
      <section className="mb-6">
        <h2 className="mb-1 t-section text-ink">누가 신청할 수 있나</h2>
        <p className="mb-3 t-sub text-text-2">
          자격이 있는 유형은 각 협회·기관의 공개 조회로 등록 상태를 확인합니다. 그 밖의 전문가는 서류·인터뷰 심사로 확인해요.
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {verifiable.map((t) => (
            <div key={t.id} className="card flex flex-col gap-1 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="t-body font-extrabold text-ink">{t.label}</span>
                <span className="rounded-md bg-primary-soft chip-pad t-caption font-bold text-primary">공개 조회</span>
              </div>
              <span className="t-sub text-text-2">{t.desc}</span>
              {t.source && (
                <span className="t-caption text-text-3">
                  확인 · {t.source.label} — {t.source.searchHint}
                </span>
              )}
              {t.extraScope && <span className="t-caption font-bold text-brand-navy">+ {t.extraScope}</span>}
            </div>
          ))}
          {other && (
            <div className="card flex flex-col gap-1 rounded-2xl border-dashed p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="t-body font-extrabold text-ink">{other.label}</span>
                <span className="rounded-md bg-warning-soft chip-pad t-caption font-bold text-warning">서류·인터뷰</span>
              </div>
              <span className="t-sub text-text-2">{other.desc}</span>
              <span className="t-caption text-text-3">증빙 URL(자격·경력)과 소개를 바탕으로 인터뷰 심사</span>
            </div>
          )}
        </div>
        <p className="mt-2 t-caption text-text-3">
          법률 서비스는 결제 정책상 유료 입점이 불가해 받지 않습니다 · 절차·검증 기준은{" "}
          <Link href="/legal/expert" className="font-bold text-primary underline underline-offset-2">
            전문가 운영정책
          </Link>
        </p>
      </section>

      {/* ---------- 절차 (verification-policy 단일 출처) ---------- */}
      <section className="mb-6">
        <h2 className="mb-3 t-section text-ink">인증 절차</h2>
        <ol className="card flex list-none flex-col divide-y divide-line rounded-2xl px-5">
          {pipeline.map((s) => (
            <li key={s.id} className="flex items-start gap-3 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-navy t-caption font-extrabold text-on-dark t-num">
                {s.step}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="t-body font-extrabold text-ink">{s.label}</span>
                  {s.slaHours && <span className="t-caption text-text-3">목표 {s.slaHours}시간 안</span>}
                </div>
                <p className="t-sub text-text-2">{s.description}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-2 t-caption text-text-3">단계마다 결과를 알림함으로 보내드려요 · 접수 시 개인정보(계좌 등)는 적지 마세요</p>
      </section>

      {/* ---------- 비용 · 정산 (정직 고지) ---------- */}
      <section className="mb-6 rounded-[18px] bg-brand-hanji px-5 py-5 md:px-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[560px]">
            <div className="t-caption font-extrabold tracking-wider text-brand-hanji-ink opacity-70">비용 · 정산</div>
            <h2 className="mt-1 t-section text-brand-hanji-ink">가입 심사비 {feeRow("전문가 가입 심사비")} — 수수료는 결제가 열린 뒤에만</h2>
            <p className="mt-2 t-sub text-brand-hanji-ink opacity-90">
              지금은 프로필에 적은 상담료·리포트료가 <b>안내 금액</b>으로만 표시되고, 결제와 정산은 플랫폼에서 처리하지 않습니다.
              결제 기능이 열리면 아래 요율이 결제된 상담에만 적용되며, 변경 시 사전 고지합니다.
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-1.5 t-sub text-brand-hanji-ink md:min-w-[280px]">
            {EXPERT_CERT_FEES.filter((f) => f.label !== "광고형 상단 노출").map((f) => (
              <div key={f.label} className="contents">
                <dt className="opacity-80">{f.label}</dt>
                <dd className="text-right font-extrabold t-num">{f.rate}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Link href="/legal/fees" className="mt-3 inline-block t-caption font-bold text-brand-hanji-ink underline underline-offset-2">
          거래·수수료 안내 전체 보기 ›
        </Link>
      </section>

      {/* ---------- 규칙 ---------- */}
      <section className="mb-6">
        <h2 className="mb-3 t-section text-ink">지켜야 할 것</h2>
        <ul className="flex list-none flex-col gap-2">
          {RULES.map((r) => (
            <li key={r.text} className="flex items-start gap-2.5 t-sub text-text-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon name={r.icon} size={13} />
              </span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- FAQ (JSON-LD 와 같은 배열) ---------- */}
      <section className="mb-6">
        <h2 className="mb-3 t-section text-ink">전문가가 자주 묻는 질문</h2>
        <div className="card flex flex-col divide-y divide-line rounded-2xl px-5">
          {EXPERT_JOIN_FAQ.map((f) => (
            <details key={f.q} className="group py-3.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 t-body font-bold text-ink">
                {f.q}
                <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 t-sub text-text-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- 마지막 CTA ---------- */}
      <section className="rise-in brand-navy-card mb-5 flex flex-col items-start gap-3 rounded-[18px] px-5 py-5 md:flex-row md:items-center md:justify-between md:px-7">
        <div>
          <div className="t-section text-on-dark">접수부터 승인까지, 진행 상황은 알림으로</div>
          <p className="mt-0.5 t-sub text-on-dark-muted">
            로그인 후 신청 — 계정에 연결해 접수하고, 인증되면 마이 › 전문가 프로필에서 바로 관리합니다.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ExpertApplyCta label="전문가 인증 신청하기" />
          <Link href="/partners" className="brand-photo-chip rounded-xl px-4 py-2.5 t-sub font-bold no-underline">
            중개사무소 제휴 ›
          </Link>
        </div>
      </section>

      <ComplianceNotice variant="market" />
    </PageShell>
  );
}
