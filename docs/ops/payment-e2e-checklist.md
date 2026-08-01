# 실결제 E2E 체크리스트 (오너)

코드 경로 스모크: `npm run smoke:payment-paths` (실결제 없음).

## 사전

- [ ] Toss 키 Production 확인
- [ ] 소액 테스트 카드/계좌 준비
- [ ] 승인: 실결제·환불 테스트 진행

## 시나리오

1. Free → Pro 월간 결제 성공 → `profiles.plan=pro` · `/subscription` 내역 1건  
2. 결제 실패/취소 → fail 페이지 · plan 유지  
3. 동일 세션 중복 ready/create → 중복 차단  
4. 해지 요청 버튼 → 고객센터 접수 알림  
5. (선택) 환불 요청 → 약관 SLA 안내

완료 후 `lib/open-beta/checklist.ts` 의 `payment-e2e` 를 `done` 으로 갱신.
