const lightCard =
  "flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5";

export default function AdminQualityPage() {
  return (
    <>
      <div className="rise-in text-[19px] font-extrabold text-white">
        사용자 세그먼트 · AI 품질 모니터링 · 중개사 인증 심사
      </div>

      <div className="rise-in-1 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 사용자 세그먼트 */}
        <div className={lightCard}>
          <div className="text-sm font-extrabold text-ink">사용자 세그먼트</div>
          <div className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center justify-between rounded-[10px] bg-bg px-3 py-2.5">
              <span>
                <b className="text-[#1a7f4e]">●</b>{" "}
                <b className="text-ink">임장 활성</b> (주 1+ 노트)
              </span>
              <span className="font-extrabold tabular-nums text-ink">
                4,210 <b className="text-[9px] text-[#1a7f4e]">+8%</b>
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-bg px-3 py-2.5">
              <span>
                <b className="text-[#e8a13a]">●</b>{" "}
                <b className="text-ink">휴면 전환 위험</b> (14일 무활동)
              </span>
              <span className="font-extrabold tabular-nums text-ink">1,873</span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-bg px-3 py-2.5">
              <span>
                <b className="text-danger">●</b>{" "}
                <b className="text-ink">이탈 위험</b> (30일+ · 구독 중)
              </span>
              <span className="font-extrabold tabular-nums text-ink">412</span>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[rgba(25,31,40,.96)] px-3.5 py-3">
            <span className="text-[11px] text-[#e2e8f2]">
              이탈 위험 412명에게
              <br />
              <b className="text-ai-accent">&quot;찜 매물 변동&quot; 다이제스트</b>{" "}
              발송
            </span>
            <button className="rounded-[9px] bg-primary px-[13px] py-2 text-[11px] font-bold text-white">
              캠페인 생성
            </button>
          </div>
          <div className="text-[10px] text-text-3">
            세그먼트 조건 빌더로 커스텀 코호트 저장 · 발송은 알림 피로도
            규칙(12l) 준수
          </div>
        </div>

        {/* AI 품질 모니터링 */}
        <div className={lightCard}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-extrabold text-ink">
              AI 품질 모니터링
            </span>
            <span className="text-[10px] text-text-3">최근 7일</span>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 rounded-xl bg-bg p-3 text-center">
              <div className="text-xl font-extrabold tabular-nums text-ink">
                91.4%
              </div>
              <div className="text-[9px] text-text-3">👍 비율 (n=2,140)</div>
            </div>
            <div className="flex-1 rounded-xl bg-bg p-3 text-center">
              <div className="text-xl font-extrabold tabular-nums text-danger">
                184
              </div>
              <div className="text-[9px] text-text-3">👎 리뷰 대기</div>
            </div>
          </div>
          <div className="flex flex-col gap-[5px] text-[10px]">
            <div className="rounded-[9px] bg-[#fbeaea] px-[11px] py-2 text-text-1">
              <b className="text-danger">패턴:</b> 표본 3건 미만 단지에서 적정가
              👎 집중 (62건) → 신뢰도 라벨 &quot;낮음&quot; 강등 룰 제안
            </div>
            <div className="rounded-[9px] bg-bg px-[11px] py-2 text-text-1">
              <b>오답 리뷰:</b> 공작 84A 적정가 4.7억 vs 실거래 5.05억 · 원인:
              급매 1건이 평균 왜곡
            </div>
          </div>
          <div className="text-[10px] text-text-3">
            👎 사유는 12k 피드백 버튼에서 수집 · 주간 리포트로 모델팀 전달
          </div>
        </div>

        {/* 중개사 인증 심사 */}
        <div className={lightCard}>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-extrabold text-ink">
              중개사 인증 심사
            </span>
            <span className="text-[10px] text-text-3">대기 7건 · 평균 1.2일</span>
          </div>
          <div className="flex flex-col gap-2 rounded-[14px] bg-bg p-3.5">
            <div className="flex items-center gap-2.5">
              <div
                className="h-[34px] w-[34px] rounded-full"
                style={{
                  background:
                    "repeating-linear-gradient(45deg,#e2e8f2,#e2e8f2 5px,#eef2f8 5px,#eef2f8 10px)",
                }}
              />
              <div>
                <div className="text-xs font-extrabold text-ink">
                  관양부동산 · 김OO
                </div>
                <div className="text-[9px] text-text-3">
                  신청 7/17 · 담당 지역 관양동
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-[10px] text-text-1">
              <div className="flex justify-between">
                <span>공인중개사 자격증</span>
                <b className="text-[#1a7f4e]">국가자격 DB 일치 ✓</b>
              </div>
              <div className="flex justify-between">
                <span>사업자등록·개설등록</span>
                <b className="text-[#1a7f4e]">유효 ✓</b>
              </div>
              <div className="flex justify-between">
                <span>사무소 실사진</span>
                <b className="text-[#e8a13a]">검토 필요</b>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button className="flex-1 rounded-[9px] bg-primary p-2 text-center text-[11px] font-bold text-white">
                승인
              </button>
              <button className="flex-1 rounded-[9px] border border-line-strong bg-surface p-2 text-center text-[11px] font-bold text-text-1">
                보완 요청
              </button>
              <button className="flex-1 rounded-[9px] border border-line-strong bg-surface p-2 text-center text-[11px] font-bold text-danger">
                반려
              </button>
            </div>
          </div>
          <div className="text-[10px] text-text-3">
            승인 시 인증 배지 발급(11g) · 매년 자동 재검증 · 반려 사유 템플릿
            6종
          </div>
        </div>
      </div>
    </>
  );
}
