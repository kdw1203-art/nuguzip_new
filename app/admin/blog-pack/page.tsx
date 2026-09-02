import { buildBlogPack } from "@/lib/content/blog-pack";
import { CopyBlock } from "./CopyBlock";

/* [#58] 네이버 블로그 주간 팩 — 관리자 전용(레이아웃이 RBAC 게이트).
   매 방문 시점 데이터로 즉석 생성(force-dynamic 은 admin 레이아웃이 이미 강제).
   발행 절차: 제목 하나 고르고 → 본문 붙여넣고 → 이미지 URL 삽입 → 해시태그. */

export const metadata = { title: "블로그 팩 · 내집나우 Admin" };

export default async function BlogPackPage() {
  let pack: Awaited<ReturnType<typeof buildBlogPack>> | null = null;
  let failed = false;
  try {
    pack = await buildBlogPack();
  } catch {
    failed = true;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold text-white">네이버 블로그 주간 팩</h1>
        <p className="mt-1 text-[12.5px] leading-[1.7] text-[#9aa6b8]">
          지금 시점 데이터로 만든 붙여넣기 완성본입니다. 발행은 직접 하시고, 본문 안의 출처
          문단과 &ldquo;투자 권유 아님&rdquo; 문구는 지우지 말아 주세요. 이미지는 URL 을
          붙여넣으면 매일 자동 갱신되는 시장 카드가 들어갑니다.
        </p>
      </div>

      {failed || !pack ? (
        <div className="rounded-2xl border border-[rgba(255,255,255,.12)] bg-[#1a2130] p-5 text-[13px] text-[#c9d2e0]">
          팩 생성에 실패했어요. 데이터 소스가 일시적으로 응답하지 않는 상태일 수 있으니
          잠시 후 새로고침해 주세요.
        </div>
      ) : (
        <>
          {pack.missing.length > 0 && (
            <div className="rounded-xl border border-[#5a4a1e] bg-[#2a2416] px-4 py-3 text-[12px] text-[#e0c589]">
              이번 팩에서 빠진 섹션: {pack.missing.join(", ")} — 소스 조회 실패로 생략됐어요
              (없는 것이 아니라 못 읽은 것). 잠시 후 새로고침하면 채워질 수 있어요.
            </div>
          )}
          <CopyBlock label="제목 후보 1" text={pack.titles[0] ?? ""} rows={2} />
          {pack.titles[1] && <CopyBlock label="제목 후보 2" text={pack.titles[1]} rows={2} />}
          <CopyBlock
            label={`본문 (포함: ${pack.sections.join(" · ") || "요약만"})`}
            text={pack.body}
            rows={18}
          />
          <CopyBlock label="해시태그" text={pack.hashtags.map((h) => `#${h}`).join(" ")} rows={2} />
          <CopyBlock label="공유 이미지 URL (매일 자동 갱신)" text={pack.imageUrl} rows={2} />
          <div className="rounded-xl bg-[#141a26] px-4 py-3 text-[11.5px] leading-[1.7] text-[#8b94a6]">
            생성 시각: {new Date(pack.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}{" "}
            (KST) · 이미지 미리보기는 새 탭에서 URL 을 열어 확인하세요. 주간 발행 권장 요일:
            월요일 오전(주말 신고 반영 후).
          </div>
        </>
      )}
    </div>
  );
}
