const KANBAN: {
  title: string;
  cards: {
    title: string;
    sub: string;
    accent: string;
    bg?: string;
    titleColor?: string;
  }[];
}[] = [
  {
    title: "접수 (8)",
    cards: [
      {
        title: "동편3 84 월세 · 재등록 패턴",
        sub: "신고 3건 · 자동 감지 포함 · 2시간 전",
        accent: "#e8a13a",
      },
      {
        title: "샘마을 59 전세 · 가격 상이",
        sub: "신고 1건 · 어제",
        accent: "#e8a13a",
      },
    ],
  },
  {
    title: "소명 대기 (4)",
    cards: [
      {
        title: "관양부동산 · 공작 84A",
        sub: "소명 요청 발송 · 응답 기한 D-2",
        accent: "#1d4fd8",
      },
      {
        title: "OO공인 · 한가람 59",
        sub: "소명 접수됨 — 검토 대기",
        accent: "#1d4fd8",
      },
    ],
  },
  {
    title: "판정 완료 (이번 주 11)",
    cards: [
      {
        title: "확정 · XX부동산 3번째",
        sub: "배지 회수 + 카드 “신고 이력” 6개월 표기(11g)",
        accent: "",
        bg: "#fbeaea",
        titleColor: "#d64545",
      },
      {
        title: "기각 · 정상 매물 확인",
        sub: "신고자에게 사유 회신",
        accent: "",
        bg: "#e7f5ee",
        titleColor: "#1a7f4e",
      },
    ],
  },
];

export default function AdminModerationPage() {
  return (
    <>
      <div className="rise-in flex flex-wrap items-center justify-between gap-2">
        <span className="text-[19px] font-extrabold text-white">
          허위매물 신고 처리
        </span>
        <span className="text-[11px] text-[#9aa6b8]">
          SLA: 접수→판정 72시간 · 평균 41시간
        </span>
      </div>

      {/* 칸반 3열 */}
      <div className="rise-in-1 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {KANBAN.map((col) => (
          <div
            key={col.title}
            className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-3"
          >
            <div className="text-[11px] font-extrabold text-text-3">
              {col.title}
            </div>
            {col.cards.map((card) => (
              <div
                key={card.title}
                className="rounded-[10px] p-2.5"
                style={{
                  background: card.bg ?? "#f7f9fc",
                  borderLeft: card.accent
                    ? `3px solid ${card.accent}`
                    : undefined,
                }}
              >
                <div
                  className="text-[11px] font-bold"
                  style={{ color: card.titleColor ?? "#191f28" }}
                >
                  {card.title}
                </div>
                <div className="mt-[3px] text-[9px] text-text-3">
                  {card.sub}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 모더레이션 큐 */}
      <div className="rise-in-2 flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-extrabold text-ink">
            모더레이션 큐 — 동네이야기·채팅 신고
          </span>
          <span className="text-[10px] text-text-3">
            자동 필터 룰 12개 활성 · 오탐률 3.1%
          </span>
        </div>
        <div className="flex flex-col gap-2 text-[10px] lg:flex-row">
          <div className="flex flex-1 items-center justify-between gap-2 rounded-[10px] bg-bg px-[11px] py-[9px]">
            <span className="text-text-1">
              <b className="text-danger">자동 숨김</b> · 중개 홍보 도배 (필터:
              연락처+반복)
            </span>
            <span className="flex flex-shrink-0 gap-1">
              <b className="text-[#1a7f4e]">승인</b>
              <b className="text-danger">삭제</b>
            </span>
          </div>
          <div className="flex flex-1 items-center justify-between gap-2 rounded-[10px] bg-bg px-[11px] py-[9px]">
            <span className="text-text-1">
              <b className="text-[#e8a13a]">검토 필요</b> · 특정 단지 비방 신고
              4건
            </span>
            <span className="flex flex-shrink-0 gap-1">
              <b className="text-[#1a7f4e]">유지</b>
              <b className="text-danger">숨김</b>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
