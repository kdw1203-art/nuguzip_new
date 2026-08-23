import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNote } from "@/lib/inspection/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { inspectionAverageScore } from "@/lib/inspection/store-db";
import { PrintButton } from "./PrintButton";

/* [#127] 인쇄용 노트 보기 — 브라우저 인쇄(=PDF 저장)에 최적화한 단면 문서.
   서버 PDF 생성 대신 print CSS: 의존성 0, 모든 기기에서 "PDF로 저장" 동작.
   접근 규칙은 상세와 동일(공개 or 본인). 유료 리포트(#70)의 지면 설계 원형. */

export const metadata: Metadata = {
  title: "임장노트 인쇄 | 누구집",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NotePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const note = await getNote(id);
  if (!note) notFound();
  const session = await safeAuth();
  const isOwner = Boolean(
    session?.user?.email && session.user.email === note.authorEmail,
  );
  if (!note.isPublic && !isOwner) notFound();

  const avg = inspectionAverageScore(note.scores);
  const checks = note.checklist ?? [];
  const doneChecks = checks.filter((c) => c.done);

  return (
    <div className="mx-auto max-w-[720px] bg-white p-8 text-[#111] print:p-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print { .no-print { display:none } body { background:#fff } } @page { margin: 14mm }`,
        }}
      />
      <div className="no-print mb-4 flex items-center justify-between rounded-xl bg-[#f2f4f8] px-4 py-3">
        <span className="text-[13px] font-bold">
          인쇄 대화상자에서 &lsquo;PDF로 저장&rsquo;을 고르면 파일로 저장됩니다.
        </span>
        <PrintButton />
      </div>

      <header className="border-b-2 border-[#111] pb-4">
        <div className="text-[11px] font-bold tracking-widest text-[#666]">
          누구집 임장노트 · nuguzip.com
        </div>
        <h1 className="mt-1 text-[24px] font-extrabold leading-tight">{note.title}</h1>
        <p className="mt-1 text-[13px] text-[#444]">
          {note.region}
          {note.aptName ? ` · ${note.aptName}` : ""}
          {note.visitDate ? ` · ${note.visitDate} 방문` : ""}
          {avg > 0 ? ` · 평점 ${avg.toFixed(1)}/5` : ""}
        </p>
      </header>

      {note.summary && (
        <section className="mt-5">
          <h2 className="text-[14px] font-extrabold">한 줄 요약</h2>
          <p className="mt-1 text-[14px] leading-[1.8]">{note.summary}</p>
        </section>
      )}

      {note.scores && (
        <section className="mt-5">
          <h2 className="text-[14px] font-extrabold">항목 점수</h2>
          <table className="mt-2 w-full border-collapse text-[13px]">
            <tbody>
              <tr className="border-b border-[#ddd]">
                {[
                  ["입지", note.scores.location],
                  ["학군", note.scores.school],
                  ["교통", note.scores.transport],
                  ["시설", note.scores.facility],
                  ["미래가치", note.scores.future],
                ].map(([label, v]) => (
                  <td key={String(label)} className="py-2 text-center">
                    <div className="text-[11px] text-[#666]">{label}</div>
                    <div className="text-[16px] font-extrabold">{v || "—"}</div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {doneChecks.length > 0 && (
        <section className="mt-5">
          <h2 className="text-[14px] font-extrabold">
            확인한 항목 <span className="text-[11px] font-medium text-[#666]">{doneChecks.length}/{checks.length}</span>
          </h2>
          <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
            {doneChecks.map((c) => (
              <li key={c.label}>✓ {c.label}</li>
            ))}
          </ul>
        </section>
      )}

      {note.sections?.memo && (
        <section className="mt-5">
          <h2 className="text-[14px] font-extrabold">현장 메모</h2>
          <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-[1.9]">
            {note.sections.memo}
          </p>
        </section>
      )}

      {note.photos.length > 0 && (
        <section className="mt-5">
          <h2 className="text-[14px] font-extrabold">현장 사진 {note.photos.length}장</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {note.photos.slice(0, 8).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p} src={p} alt="현장 사진" className="w-full rounded-lg" />
            ))}
          </div>
        </section>
      )}

      <footer className="mt-8 border-t border-[#ddd] pt-3 text-[11px] leading-[1.7] text-[#666]">
        이 문서는 작성자의 현장 방문 기록입니다. 개인 기록 기반이며 투자 권유가
        아닙니다. 실거래가·시세 데이터는 nuguzip.com 에서 확인하세요. ·{" "}
        {new Date().toISOString().slice(0, 10)} 출력
      </footer>
    </div>
  );
}
