import { getTemplate } from "@/lib/note-templates/store";
import { NoteForm, type NoteFormTemplate } from "./NoteForm";

/* 임장노트 작성 — 폼 본체는 NoteForm(클라이언트, /notes/[id]/edit 와 공용).
   ?tpl={id} 로 도착하면 서버에서 템플릿을 읽어 체크리스트 프리셋으로 전달한다.
   ?memo= 로 도착하면 메모 초안으로 프리필한다(/calculator "임장노트에 저장" 연결). */

export const dynamic = "force-dynamic";

export default async function NoteNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tplId = typeof sp.tpl === "string" ? sp.tpl.trim() : "";
  const presetMemo =
    typeof sp.memo === "string" && sp.memo.trim() ? sp.memo.trim().slice(0, 2000) : null;
  let template: NoteFormTemplate | null = null;
  if (tplId) {
    try {
      const t = await getTemplate(tplId);
      if (t) template = { id: t.id, title: t.title, sections: t.sections };
    } catch {
      /* 템플릿 조회 실패 — 템플릿 없이 일반 작성으로 진행 */
    }
  }
  return <NoteForm template={template} presetMemo={presetMemo} />;
}
