"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { useRecentComplexes } from "./RecentComplexes";
import {
  readNoteDraftSummary,
  type NoteDraftSummary,
} from "@/lib/notes/draft-summary";

/** ISO → "N분 전/시간 전/일 전" (표시용 축약) */
function savedAgo(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return null;
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

/**
 * 홈 히어로 우측 "이어서 보기" 패널.
 *
 * 원래 이 자리에는 작은 지도(HomeMiniMap)가 있었는데, 바로 아래 벤토 영역에
 * 같은 지도가 한 번 더 떠서 화면에 지도가 두 개 보였다. 중복을 없애면서
 * 빈 자리를 실데이터로 채우기 위해 최근 본 단지 목록을 넣는다.
 *
 * 이 패널은 `useRecentComplexes()`(localStorage + `/api/me/recent-complexes` 병합)를
 * 그대로 쓴다. 지금까지 방문 기록은 서버에 쌓이기만 하고 그걸 보여주는 화면이
 * 레포 어디에도 없었는데(읽기 컴포넌트 importer 0), 이 패널이 그 읽기 경로다.
 *
 * 사실 우선 원칙: 기록이 없으면 가짜 단지를 채우지 않고 탐색 링크만 보여준다.
 */

export function HomeResumePanel({
  regions,
  className,
}: {
  /** 관심지역명 — 하단 바로가기 칩. 없으면 칩 줄을 렌더하지 않는다. */
  regions?: string[];
  className?: string;
}) {
  const { items, loading } = useRecentComplexes();
  /* 고도화 8·21 — 작성 중 임시저장 노트가 있으면 최상단에 복귀 카드.
     NoteForm 의 자동 저장(localStorage)만 읽는다 — 없으면 카드도 없다. */
  const [draft, setDraft] = useState<NoteDraftSummary | null>(null);
  useEffect(() => {
    setDraft(readNoteDraftSummary());
  }, []);

  // 드래프트 카드가 한 줄 차지하므로 목록을 한 개 줄여 높이를 지킨다
  const list = items.slice(0, draft ? 3 : 4);
  const chips = (regions ?? []).slice(0, 3);
  const draftAgo = draft ? savedAgo(draft.savedAt) : null;
  const draftWhere = draft ? (draft.aptName ?? draft.region) : null;

  return (
    <div
      className={`card flex flex-col gap-3 rounded-[22px] p-5 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="clock" size={16} />
          <span className="text-[14px] font-extrabold text-ink">이어서 보기</span>
        </div>
        <Link
          href="/complex/browse"
          className="text-[12px] font-bold text-primary"
        >
          단지 찾기 ›
        </Link>
      </div>

      {draft && (
        <Link
          href="/notes/new"
          className="flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary-soft px-3.5 py-2.5 no-underline"
        >
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-extrabold text-ink">
              작성 중인 임장노트 이어서 쓰기
            </span>
            <span className="block truncate text-[11px] text-text-3">
              {draftWhere ? `${draftWhere} · ` : ""}
              {draftAgo ? `${draftAgo} 저장됨` : "자동 저장됨"}
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-[14px] font-extrabold text-primary">
            ›
          </span>
        </Link>
      )}

      {list.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {list.map((r) => (
            <li key={r.id}>
              <Link
                href={`/complex/${encodeURIComponent(r.id)}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5"
              >
                <span className="min-w-0 truncate text-[13px] font-bold text-ink">
                  {r.name}
                </span>
                {r.region ? (
                  <span className="shrink-0 text-[11px] text-text-3">
                    {r.region}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        /* 기록 없음 — 없는 데이터를 지어내지 않고 다음 행동만 제시.
           loading 중에는 "없다"고 단정하지 않기 위해 문구를 나눈다. */
        <div className="flex flex-1 flex-col justify-center gap-2.5 py-2">
          <p className="text-[12.5px] leading-[1.6] text-text-2">
            {loading
              ? "최근 본 단지를 불러오는 중이에요."
              : "아직 본 단지가 없어요. 지도나 검색에서 단지를 열면 여기에 쌓여서 다음에 바로 이어볼 수 있어요."}
          </p>
          {!loading && (
            <div className="flex gap-2">
              <Link
                href="/map"
                className="rounded-xl bg-primary px-3.5 py-2 text-[12px] font-bold text-white"
              >
                지도에서 찾기
              </Link>
              <Link
                href="/search"
                className="rounded-xl border border-line px-3.5 py-2 text-[12px] font-bold text-text-1"
              >
                단지 검색
              </Link>
            </div>
          )}
        </div>
      )}

      {chips.length > 0 && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <span className="text-[11px] font-extrabold text-text-3">관심지역</span>
          {/* 예전엔 모든 칩이 "/map" 이었다 — 지역별로 달라 보이는데 결과가 같아서
              눌러도 반응이 없는 것처럼 느껴졌다. ?region= 으로 그 지역을 비춘다. */}
          {chips.map((name) => (
            <Link
              key={name}
              href={`/map?region=${encodeURIComponent(name)}`}
              className="chip border border-line px-2.5 py-1 text-[11px] text-text-2"
            >
              {name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
