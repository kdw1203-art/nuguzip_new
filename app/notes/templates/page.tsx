import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { listTemplates } from "@/lib/note-templates/store";
import { TemplateBrowser } from "./TemplateBrowser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "임장 노트 템플릿 | 누구집",
  description:
    "입지·채광·소음·주차·하자부터 분양권·전월세·재건축까지, 바로 쓰는 임장 체크리스트 템플릿을 골라 임장 노트를 작성하세요. 누구집이 만든 공식 체크리스트 제공.",
  robots: { index: true, follow: true },
};

export default async function NoteTemplatesPage() {
  const items = await listTemplates();

  return (
    <PageShell breadcrumb="홈 › 임장노트 › 템플릿" title="임장 노트 템플릿">
      <p className="rise-in mb-5 text-[14px] leading-[1.7] text-text-2">
        임장 갈 때 무엇을 봐야 할지 막막하다면, 검증된 체크리스트로 시작하세요.
        아파트 기본 점검부터 분양권·전월세 계약·재건축까지 상황별 템플릿을 골라
        &lsquo;이 템플릿으로 노트 쓰기&rsquo;를 누르면 바로 임장 노트를 작성할 수 있어요.
      </p>
      <TemplateBrowser initial={items} />
    </PageShell>
  );
}
