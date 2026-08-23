import type { Metadata } from "next";
import Link from "next/link";
import { listPublicNotes, type InspectionNote } from "@/lib/inspection/store-db";
import { maskNoteAuthor } from "@/app/town/shared";
import { CoverImage } from "@/app/components/CoverImage";

/* [#143] 유료 리포트 진열대 — 잠금 상태(#70 선행분).
   기준을 넘는 공개 노트를 "판매 예정 리포트"로 미리 진열한다. 결제 버튼은
   비활성(오픈 준비 중) — 결제 기능 승인 회신이 오면 버튼만 켠다(billing-open 런북).
   가격은 표시하지 않는다: 가격은 오픈 후 판매자(작성자)가 등록할 때 정해진다.
   기준(#70): 사진 5장+ · 본문 2,000자+ (방문 인증은 우대 배지). */

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "임장 리포트 진열대 — 판매 오픈 준비 중 | 누구집",
  description:
    "기준을 충족한 임장노트가 유료 리포트로 판매될 예정입니다. 사진 5장 이상, 본문 2,000자 이상의 검증된 현장 기록.",
  alternates: { canonical: "/notes/market" },
};

const MIN_PHOTOS = 5;
const MIN_TEXT = 2000;

function noteTextLen(n: InspectionNote): number {
  const parts: string[] = [n.summary ?? ""];
  for (const v of Object.values(n.sections ?? {})) if (typeof v === "string") parts.push(v);
  return parts.join("").length;
}

export default async function NotesMarketPage() {
  let notes: InspectionNote[] = [];
  let loadFailed = false;
  try {
    notes = await listPublicNotes(50);
  } catch {
    loadFailed = true;
  }

  const qualified = notes
    .map((n) => ({ note: n, textLen: noteTextLen(n) }))
    .filter(
      ({ note, textLen }) => (note.photos?.length ?? 0) >= MIN_PHOTOS && textLen >= MIN_TEXT,
    );

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-4 py-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-2">
        <nav className="text-[12px] font-semibold text-text-3">
          <Link href="/notes" className="no-underline hover:underline">
            임장노트
          </Link>{" "}
          › 리포트 진열대
        </nav>
        <h1 className="text-[22px] font-extrabold leading-[1.3] text-ink">
          임장 리포트 진열대{" "}
          <span className="align-middle rounded-full bg-warning-soft px-2.5 py-1 text-[11.5px] font-extrabold text-warning">
            판매 오픈 준비 중
          </span>
        </h1>
        <p className="text-[13.5px] leading-[1.7] text-text-2">
          아래 기준을 충족한 공개 임장노트는 결제 기능이 열리면 작성자가 유료
          리포트로 판매할 수 있어요. 지금은 진열만 미리 공개합니다 — 전문은 각
          노트에서 무료로 읽을 수 있어요.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-[9px] bg-bg px-2.5 py-1 text-[11.5px] font-bold text-text-2">
            기준 · 사진 {MIN_PHOTOS}장+
          </span>
          <span className="rounded-[9px] bg-bg px-2.5 py-1 text-[11.5px] font-bold text-text-2">
            본문 {MIN_TEXT.toLocaleString("ko-KR")}자+
          </span>
          <span className="rounded-[9px] bg-bg px-2.5 py-1 text-[11.5px] font-bold text-text-2">
            직접 방문 인증 우대
          </span>
        </div>
      </div>

      {/* 목록 */}
      {loadFailed ? (
        <div className="rounded-[14px] border border-line bg-surface px-5 py-8 text-center text-[13px] font-bold text-text-3">
          목록을 불러오지 못했어요 — 잠시 후 다시 시도해 주세요.
        </div>
      ) : qualified.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-surface px-5 py-8 text-center">
          <p className="text-[13.5px] font-bold text-text-2">
            아직 기준을 충족한 노트가 없어요.
          </p>
          <p className="mt-1 text-[12.5px] text-text-3">
            사진 {MIN_PHOTOS}장·본문 {MIN_TEXT.toLocaleString("ko-KR")}자를 넘긴 첫
            노트가 이 자리에 올라옵니다.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {qualified.map(({ note, textLen }) => {
            const verified = Boolean(note.metadata?.visitVerified);
            return (
              <div
                key={note.id}
                className="flex flex-col overflow-hidden rounded-[16px] border border-line bg-surface"
              >
                <div className="relative h-[150px] w-full overflow-hidden bg-bg">
                  <CoverImage
                    src={note.photos?.[0] ?? null}
                    alt=""
                    imgClassName="absolute inset-0 h-full w-full object-cover"
                    fallback={
                      <div className="absolute inset-0 flex items-center justify-center bg-primary-soft text-[13px] font-extrabold text-primary">
                        임장노트
                      </div>
                    }
                  />
                  {verified && (
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-success px-2 py-0.5 text-[10.5px] font-extrabold text-surface">
                      ✓ 직접 방문 인증
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <div className="text-[14px] font-extrabold leading-[1.45] text-ink line-clamp-2">
                    {note.title}
                  </div>
                  <div className="text-[12px] font-semibold text-text-3">
                    {note.region}
                    {note.aptName ? ` · ${note.aptName}` : ""} ·{" "}
                    {maskNoteAuthor(note.authorLabel, note.authorEmail ?? "")}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <span className="rounded-[7px] bg-bg px-2 py-0.5 text-[11px] font-bold text-text-2">
                      사진 {note.photos.length}장
                    </span>
                    <span className="rounded-[7px] bg-bg px-2 py-0.5 text-[11px] font-bold text-text-2">
                      본문 {textLen.toLocaleString("ko-KR")}자
                    </span>
                  </div>
                  <div className="mt-auto flex items-center gap-2 pt-2.5">
                    <Link
                      href={`/notes/${note.id}`}
                      className="rounded-[10px] border border-line-strong bg-bg px-3.5 py-2 text-[12.5px] font-bold text-text-1 no-underline"
                    >
                      전문 미리보기
                    </Link>
                    <button
                      type="button"
                      disabled
                      title="결제 기능 오픈 후 판매가 시작됩니다"
                      className="flex-1 cursor-not-allowed rounded-[10px] bg-bg px-3.5 py-2 text-[12.5px] font-extrabold text-text-3"
                    >
                      🔒 판매 오픈 준비 중
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 작성자 CTA + 정직 고지 */}
      <div className="rounded-[14px] border border-line bg-bg px-4 py-3.5">
        <p className="text-[12.5px] leading-[1.7] text-text-2">
          <strong className="text-ink">내 노트도 올리고 싶다면</strong> — 기준(사진{" "}
          {MIN_PHOTOS}장+·본문 {MIN_TEXT.toLocaleString("ko-KR")}자+)을 넘긴 공개
          노트는 자동으로 이 진열대에 올라옵니다.{" "}
          <Link href="/notes/new" className="font-bold text-primary no-underline">
            임장노트 쓰기 ›
          </Link>
        </p>
        <p className="mt-1.5 text-[11.5px] leading-[1.7] text-text-3">
          판매 가격·정산은 결제 기능 오픈 후 작성자가 직접 정합니다. 오픈 전까지
          어떤 결제도 발생하지 않아요.
        </p>
      </div>
    </div>
  );
}
