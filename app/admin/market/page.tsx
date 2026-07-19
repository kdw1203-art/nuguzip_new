const panelCard =
  "flex flex-col gap-3 rounded-2xl border border-[rgba(255,255,255,.06)] bg-[#12161f] p-5";

const STATS: { label: string; value: string; delta?: string; color: string }[] = [
  { label: "7월 마켓 거래액", value: "1,440만", delta: "+18%", color: "#fff" },
  { label: "플랫폼 수수료", value: "238만", color: "#7ea2ff" },
  { label: "환불 요청", value: "2건", color: "#f2c94c" },
];

export default function AdminMarketPage() {
  return (
    <>
      <div className="rise-in text-[19px] font-extrabold text-white">
        마켓·정산 / 공지·배너 관리
      </div>

      <div className="rise-in-1 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 마켓 · 정산 */}
        <div className={panelCard}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">
              마켓 · 정산
            </span>
            <span className="text-[11px] text-[#9aa6b8]">7월 1차 정산 D-2</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)] p-3"
              >
                <div className="text-[10px] text-[#9aa6b8]">{s.label}</div>
                <div
                  className="text-lg font-extrabold"
                  style={{ color: s.color }}
                >
                  {s.value}{" "}
                  {s.delta ? (
                    <span className="text-[10px] text-[#4ade80]">
                      {s.delta}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1.4fr_1fr_1fr_.9fr] gap-1.5 border-b border-[rgba(255,255,255,.08)] py-1.5 text-[10px] text-[#9aa6b8]">
            <span>전문가</span>
            <span className="text-right">판매액</span>
            <span className="text-right">정산액 (수수료 차감)</span>
            <span className="text-center">상태</span>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr_1fr_.9fr] items-center gap-1.5 border-b border-[rgba(255,255,255,.06)] py-2 text-[11px]">
            <span className="font-bold text-white">김OO 중개사 (프로 15%)</span>
            <span className="text-right text-[#c9d2e0]">212만</span>
            <span className="text-right font-extrabold text-white">180만</span>
            <span className="text-center text-[10px] font-bold text-[#4ade80]">
              지급 대기
            </span>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr_1fr_.9fr] items-center gap-1.5 border-b border-[rgba(255,255,255,.06)] py-2 text-[11px]">
            <span className="font-bold text-white">
              박OO 임장러 (플러스 20%)
            </span>
            <span className="text-right text-[#c9d2e0]">105만</span>
            <span className="text-right font-extrabold text-white">84만</span>
            <span className="text-center text-[10px] font-bold text-[#f2c94c]">
              계좌 확인
            </span>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr_1fr_.9fr] items-center gap-1.5 py-2 text-[11px]">
            <span className="font-bold text-[#d6708b]">
              환불: “관양 재건축” 리포트
            </span>
            <span className="text-right text-[#c9d2e0]">9,900원</span>
            <span className="text-right text-[#9aa6b8]">미열람 확인됨</span>
            <span className="text-center">
              <span className="rounded-md bg-[rgba(126,162,255,.12)] px-2 py-[3px] text-[10px] font-bold text-[#7ea2ff]">
                승인
              </span>
            </span>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 rounded-[10px] bg-primary p-2.5 text-center text-xs font-bold text-white">
              일괄 정산 실행 (12명 · 216만)
            </button>
            <button className="rounded-[10px] bg-[rgba(255,255,255,.08)] px-4 py-2.5 text-xs font-bold text-[#c9d2e0]">
              내역 CSV
            </button>
          </div>
        </div>

        {/* 공지 · 배너 관리 */}
        <div className={panelCard}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">
              공지 · 배너 관리
            </span>
            <span className="text-[11px] font-bold text-[#7ea2ff]">
              + 새 공지
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] px-3.5 py-3">
            <div>
              <div className="text-xs font-extrabold text-white">
                홈 배너: 첫 노트 → 플러스 1개월{" "}
                <span className="text-[9px] font-extrabold text-[#4ade80]">
                  게시 중
                </span>
              </div>
              <div className="mt-[3px] text-[10px] text-[#9aa6b8]">
                07.10~07.31 · 노출 42,180 · 클릭률 4.2%
              </div>
            </div>
            <div className="flex flex-shrink-0 gap-1.5 text-[11px]">
              <button className="rounded-lg bg-[rgba(255,255,255,.08)] px-2.5 py-[5px] text-[#c9d2e0]">
                수정
              </button>
              <button className="rounded-lg bg-[rgba(255,255,255,.08)] px-2.5 py-[5px] text-[#c9d2e0]">
                내리기
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] px-3.5 py-3">
            <div>
              <div className="text-xs font-extrabold text-white">
                공지: AI 리포트 v2 업데이트{" "}
                <span className="text-[9px] font-extrabold text-[#4ade80]">
                  게시 중
                </span>
              </div>
              <div className="mt-[3px] text-[10px] text-[#9aa6b8]">
                07.15 · 조회 8,214 · 앱 푸시 발송됨
              </div>
            </div>
            <div className="flex flex-shrink-0 gap-1.5 text-[11px]">
              <button className="rounded-lg bg-[rgba(255,255,255,.08)] px-2.5 py-[5px] text-[#c9d2e0]">
                수정
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(242,201,76,.25)] bg-[rgba(242,201,76,.06)] px-3.5 py-3">
            <div>
              <div className="text-xs font-extrabold text-white">
                예약: 개인정보처리방침 개정 리마인드{" "}
                <span className="text-[9px] font-extrabold text-[#f2c94c]">
                  예약 07.14 09:00
                </span>
              </div>
              <div className="mt-[3px] text-[10px] text-[#9aa6b8]">
                대상: 전체 회원 · 인앱 + 이메일
              </div>
            </div>
            <div className="flex flex-shrink-0 gap-1.5 text-[11px]">
              <button className="rounded-lg bg-[rgba(255,255,255,.08)] px-2.5 py-[5px] text-[#c9d2e0]">
                예약 취소
              </button>
            </div>
          </div>
          <div className="text-[10px] leading-[1.6] text-[#9aa6b8]">
            배너 슬롯: 홈 히어로 하단 1 · 자료 목록 중간 1 · AD(애드센스)와
            별도 운영. 공지는 중요도(일반/중요/긴급)에 따라 푸시 여부 자동
            결정.
          </div>
        </div>
      </div>
    </>
  );
}
