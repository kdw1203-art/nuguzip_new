import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { TOWN_PROMPTS, todayPromptIndex } from "@/lib/town/prompts";

/* [3차→#63] 오늘의 동네 글감 — 질문·태깅·스레드가 lib/town/prompts 단일 출처를 본다.
 * 카드는 글쓰기(제목 프리필 + 글감 인덱스)와 답변 모아보기(스레드)로 갈라진다. */

export function TownPromptCard() {
  const idx = todayPromptIndex();
  const prompt = TOWN_PROMPTS[idx];
  return (
    <div className="rise-in card mb-4 flex flex-wrap items-center gap-3 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-primary">
          <Icon name="notebook-pen" size={13} />
          오늘의 동네 글감
        </span>
        <span className="text-[14px] font-bold leading-[1.5] text-ink">{prompt}</span>
        <Link
          href={`/town/prompt/${idx}`}
          className="mt-0.5 w-fit text-[11.5px] font-bold text-text-3 underline-offset-2 hover:underline"
        >
          이 질문의 답변 모아보기 ›
        </Link>
      </div>
      <Link
        href={`/town/write?topic=${encodeURIComponent(prompt)}&pi=${idx}`}
        className="btn-cta shrink-0 rounded-full px-4 py-2 text-[12.5px] font-extrabold no-underline tap-ripple"
      >
        답변 쓰기 +50P
      </Link>
    </div>
  );
}
