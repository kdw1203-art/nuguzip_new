import Link from "next/link";
import { Icon } from "@/app/components/Icon";

/* [959] 전문가 띠 — 동네이야기 허브의 한지 면.
   두 방향을 한 줄에: 묻는 사람(상담·견적)과 참여할 사람(전문가 모집).
   숫자를 지어내지 않는다 — "모집 중"이라고 말하고, 실측은 /town/experts 히어로가 보여 준다. */
export function TownExpertBand() {
  return (
    <section className="mb-4 flex flex-col gap-3 rounded-[18px] bg-brand-hanji px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-on-dark">
          <Icon name="graduation" size={20} />
        </span>
        <div>
          <div className="t-body font-extrabold text-brand-hanji-ink">
            공인중개사·세무사·감정평가사·대출상담사 — 자격을 확인한 전문가에게 글로 묻기
          </div>
          <p className="mt-0.5 t-sub text-brand-hanji-ink opacity-80">
            답변은 상담함으로, 후기는 답변 완료 의뢰자만. 전문가 등록은 서류·신원 확인 뒤 승인됩니다(모집 중).
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link href="/town/experts" className="btn-primary rounded-xl px-4 py-2 t-sub font-bold no-underline">
          전문가 찾기
        </Link>
        <Link
          href="/town/experts/join"
          className="rounded-xl border border-brand-navy/30 px-4 py-2 t-sub font-bold text-brand-hanji-ink no-underline"
        >
          전문가로 참여
        </Link>
      </div>
    </section>
  );
}
