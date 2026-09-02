import type { Metadata } from "next";
import { getTemplate } from "@/lib/note-templates/store";
import { NoteForm, type NoteFormTemplate } from "./NoteForm";

/* 임장노트 작성 — 폼 본체는 NoteForm(클라이언트, /notes/[id]/edit 와 공용).
   ?tpl={id} 로 도착하면 서버에서 템플릿을 읽어 체크리스트 프리셋으로 전달한다.
   ?memo= 로 도착하면 메모 초안으로 프리필한다(/calculator "임장노트에 저장" 연결). */

export const dynamic = "force-dynamic";

/* N7 — 작성 폼은 색인 대상이 아니다. ?tpl=·?memo= 로 만들어지는 URL 은 특정
   사용자의 일회용 진입 주소이고(메모 초안이 주소에 실리기도 한다), 검색에서
   들어와도 로그인 벽을 만난다. follow 는 남겨 내부 링크는 그대로 타게 둔다. */
export const metadata: Metadata = {
  title: "임장노트 작성 | 내집나우",
  robots: { index: false, follow: true },
};

export default async function NoteNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tplId = typeof sp.tpl === "string" ? sp.tpl.trim() : "";
  const presetMemo =
    typeof sp.memo === "string" && sp.memo.trim() ? sp.memo.trim().slice(0, 2000) : null;
  const preferAi =
    typeof sp.intent === "string" && sp.intent.trim().toLowerCase() === "ai";
  const fromWelcome =
    typeof sp.from === "string" && sp.from.trim().toLowerCase() === "welcome";
  /* [#68] 현장 퀵모드 — ?quick=1: 사진·위치·메모만 먼저, 세부 항목은 접힘 */
  const quickStart = typeof sp.quick === "string" && sp.quick.trim() === "1";
  let template: NoteFormTemplate | null = null;
  if (tplId) {
    try {
      const t = await getTemplate(tplId);
      if (t) template = { id: t.id, title: t.title, sections: t.sections };
    } catch {
      /* 템플릿 조회 실패 — 템플릿 없이 일반 작성으로 진행 */
    }
  }
  return (
    <NoteForm
      template={template}
      presetMemo={presetMemo}
      preferAi={preferAi || fromWelcome}
      fromWelcome={fromWelcome}
      quickStart={quickStart}
    />
  );
}
