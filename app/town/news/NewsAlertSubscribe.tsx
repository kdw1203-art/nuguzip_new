"use client";

import { useState } from "react";
import { Icon } from "@/app/components/Icon";
import { KeywordAlertButton } from "@/app/components/KeywordAlertButton";

/* [개선 #13] 뉴스 키워드 알림 구독 스트립.
 * 관심 동네·단지·키워드를 입력하면 저장 검색(scope:"news")으로 구독된다 —
 * 자동수집 뉴스·동네글에 그 키워드가 새로 등장하면 알림함으로 알려 준다.
 * KeywordAlertButton 을 key={q} 로 다시 마운트해 키워드 변경 시 상태를 초기화한다. */

const SUGGESTIONS = ["재건축", "분양", "GTX", "전세"];

export function NewsAlertSubscribe() {
  const [q, setQ] = useState("");
  const trimmed = q.trim();

  return (
    <div className="rise-in card mb-4 flex flex-wrap items-center gap-2.5 p-4">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-ink">
        <Icon name="bell" size={15} />
        키워드 알림
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="알림 받을 키워드"
        placeholder="동네·단지·키워드 (예: 성동구, 재건축)"
        maxLength={40}
        className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-ink placeholder:text-text-3"
      />
      {trimmed ? (
        <KeywordAlertButton key={trimmed} scope="news" query={trimmed} />
      ) : (
        <div className="flex items-center gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQ(s)}
              className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-text-2 tap-ripple"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
