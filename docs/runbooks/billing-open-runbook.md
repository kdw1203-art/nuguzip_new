# 빌링(자동결제) 오픈 런북 — 승인 당일 30분 절차

> [개선 #26] 토스 심사 승인 통보가 오면 이 문서 순서대로만 실행한다.
> 코드·인프라는 전부 준비돼 있고, 이 문서는 "켜는 순서"다. (2026-08-22 작성)

## 전제 (이미 완료된 것)
- 자동결제 코드 경로: 카드 등록(빌링키 발급) → 구독 생성 → 회차 청구 크론 → 해지·일할 환불 → 카드 변경. 전 구간 구현·검증 완료.
- 게이트: `NEXT_PUBLIC_TOSS_BILLING_ENABLED` 플래그 (미설정 = 빌링 UI 숨김).
- 동결 게이트: `scripts/check-toss-review-freeze.mjs` 가 심사 제출 사실을 잠근다.

## 오픈 절차 (순서 엄수)

### 1. 라이브 키 교체 (Vercel, 5분) — 사장님
Vercel → 프로젝트 → Settings → Environment Variables (Production):
- `TOSS_SECRET_KEY` = 토스 개발자센터의 **live_sk_...** (기존 test_sk 교체)
- `NEXT_PUBLIC_TOSS_CLIENT_KEY` = **live_ck_...**
- `TOSS_BILLING_SECRET_KEY` 가 별도로 있으면 같은 방식으로 live 교체
- `NEXT_PUBLIC_TOSS_BILLING_ENABLED` = `1` 추가

### 2. 동결 게이트 갱신 (Claude, 5분)
- check-toss-review-freeze.mjs 의 LOCKED 는 "심사 제출 사실" 기준이다. 승인 후
  가격·문구를 바꾸는 경우에만 LOCKED 값을 새 사실로 갱신한다(지우지 않는다).
- 빌링 오픈 자체는 LOCKED 위반이 아니다 — 플래그와 키만 바뀐다.

### 3. 재배포 (사장님, 5분)
```powershell
cd $env:USERPROFILE\Downloads\nuguzip-deploy
npx.cmd vercel --prod
```
(환경변수 변경은 재배포해야 반영된다)

### 4. 스모크 테스트 (Claude + 사장님, 10분)
1. Claude: /subscription 렌더에 자동결제 UI 노출 확인, CSP·SDK 로드 확인
2. 사장님: 실카드로 **주간권 1,100원** 자동결제 등록 → 결제 확인 → 즉시 해지
   (일할 환불 경로까지 한 바퀴 — 총 비용 1,100원 이하)
3. Claude: billing_subscriptions·payments 행, 웹훅 수신, 관리자 화면 표시 확인

### 5. 청구 크론 확인 (Claude, 5분)
- 회차 청구 크론의 스케줄·CRON_SECRET 유효 확인, 다음 청구일 계산 검증

## 롤백 (문제 발생 시)
- `NEXT_PUBLIC_TOSS_BILLING_ENABLED` 제거 → 재배포 = 빌링 UI 즉시 숨김
  (기존 단건 결제는 영향 없음. 등록된 구독은 관리자 화면에서 개별 처리)

## 하지 말 것
- 심사 승인 **전** 플래그를 켜지 않는다 (심사 화면과 실서비스 불일치 = 반려 사유)
- 라이브 키를 코드·채팅에 붙여넣지 않는다 (Vercel 환경변수로만)
