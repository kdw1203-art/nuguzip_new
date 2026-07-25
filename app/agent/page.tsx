import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { AgentChat } from "./AgentChat";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

export const metadata = buildPageMetadata({
  title: "AI 에이전트",
  description:
    "내 임장노트와 국토교통부 실거래 데이터를 직접 조회해 답하는 누구집 AI 에이전트.",
  path: "/agent",
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 누구집 AI 에이전트 — 임장노트·실거래 grounding 챗.
   로그인하지 않으면 채팅 대신 로그인 안내를 보여 준다(도구가 본인 노트를 읽는다). */

export default async function AgentPage() {
  const session = await safeAuth();
  const signedIn = Boolean(session?.user?.email);

  return (
    <PageShell breadcrumb="AI 분석 › AI 에이전트">
      <div className="mb-4">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">누구집 AI 에이전트</h1>
        <p className="rise-in-1 mt-1 max-w-xl text-[13px] leading-[1.6] text-text-2">
          내 임장노트와 국토교통부 실거래 데이터를 <b>직접 조회해서</b> 답해요.
          기억이나 추정으로 시세를 말하지 않고, 조회한 데이터 목록을 답변과 함께 보여줍니다.
        </p>
      </div>

      {signedIn ? (
        <div className="rise-in-2">
          <AgentChat />
        </div>
      ) : (
        <div className="rise-in-2 card flex flex-col items-center gap-3 rounded-[20px] px-6 py-12 text-center">
          <div className="ai-chip flex h-11 w-11 items-center justify-center rounded-xl text-[15px]">AI</div>
          <div className="text-sm font-extrabold text-ink">로그인하면 에이전트를 쓸 수 있어요</div>
          <div className="max-w-sm text-xs leading-[1.6] text-text-3">
            에이전트는 회원님의 임장노트를 읽어 답하기 때문에 로그인이 필요해요.
          </div>
          <Link href="/login?next=/agent" className="btn-primary rounded-xl px-5 py-2.5 text-[13px] no-underline">
            로그인하고 시작하기
          </Link>
        </div>
      )}
    </PageShell>
  );
}
