import type { ReactNode } from "react";
import { Children } from "react";
import { isRenderable } from "@/lib/ui/renderable";
import { cn } from "@/lib/utils";

/**
 * 빈 공간이 생기지 않는 세로 배치 — 넣고 빼도 자리가 남지 않는다.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────
 * 화면에 설명할 수 없는 빈 칸이 생기는 이유는 대개 셋 중 하나다.
 *   ① 내용이 없는데 상자를 그렸다 (패딩·테두리만 남은 카드)
 *   ② 내용이 없는데 제목을 그렸다 (제목 아래가 텅 빈 섹션)
 *   ③ 간격을 자식의 margin 으로 줬다 (자식이 빠져도 margin 은 남는다)
 *
 * 이 컴포넌트는 셋을 한꺼번에 막는다.
 *   ① 그려지는 자식이 하나도 없으면 **상자 자체를 렌더하지 않는다**(null).
 *   ② `Section` 은 본문이 비면 제목·더보기까지 통째로 사라진다.
 *   ③ 간격은 항상 `gap` 이다 — 자식이 빠지면 그 간격도 같이 사라진다.
 *
 * 조건부 자식을 그냥 넣으면 된다. 꺼지면 알아서 접힌다:
 *   <AutoStack gap={3}>
 *     {hasNotes && <NoteList … />}
 *     {hasPosts && <PostList … />}
 *   </AutoStack>
 */

type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/* Tailwind 는 클래스 이름을 소스에서 문자열로 찾는다 — `gap-${n}` 처럼
   조립하면 빌드 결과에 그 클래스가 없다. 그래서 표로 적어 둔다. */
const GAP_CLASS: Record<Gap, string> = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
};

export function AutoStack({
  children,
  gap = 3,
  className,
  as: Tag = "div",
  ...rest
}: {
  children?: ReactNode;
  gap?: Gap;
  className?: string;
  as?: "div" | "section" | "aside" | "ul" | "li" | "main";
} & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  const kids = Children.toArray(children).filter(isRenderable);
  if (kids.length === 0) return null;
  return (
    <Tag className={cn("flex flex-col", GAP_CLASS[gap], className)} {...rest}>
      {kids}
    </Tag>
  );
}

/**
 * 제목이 붙은 구역. **본문이 비면 제목까지 통째로 사라진다.**
 *
 * 제목만 남은 섹션은 "여기 뭔가 있어야 하는데 없다"를 화면에 그려 놓는 것과
 * 같다. 빈 상태를 보여 주고 싶으면 `empty` 에 명시적으로 넘긴다 — 그때는
 * 그 빈 상태가 본문이 되므로 섹션이 남는다. 아무것도 안 넘기면 사라진다.
 */
export function Section({
  title,
  action,
  children,
  empty,
  gap = 3,
  className,
  headingClassName,
  ...rest
}: {
  title: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  /** 본문이 비었을 때 대신 그릴 것. 없으면 섹션 자체가 사라진다. */
  empty?: ReactNode;
  gap?: Gap;
  className?: string;
  headingClassName?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "title">) {
  const kids = Children.toArray(children).filter(isRenderable);
  const body = kids.length > 0 ? kids : isRenderable(empty) ? [empty] : [];
  if (body.length === 0) return null;
  return (
    <section className={cn("flex flex-col", GAP_CLASS[gap], className)} {...rest}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={cn("t-section text-ink", headingClassName)}>{title}</h2>
        {isRenderable(action) ? action : null}
      </div>
      {body}
    </section>
  );
}
