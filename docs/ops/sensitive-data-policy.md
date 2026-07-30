# 성범죄·민감정보 비저장/비노출 정책

코드: `lib/compliance/platform-policy.ts` → `SAFETY_UI_POLICY`.

## 원칙

- ETL·공공 API에 치안 원자료가 있어도 **UI에는 행정구역 단위 집계 지수만** 표시  
- `allowIndividualAddress: false` — 주소·사건 단위 성범죄 정보 비노출  
- 라벨: `지역 치안·안전 종합 지수` (+ 집계 고지)

## 점검

```bash
npm run check:sensitive-policy
```

금지 패턴(주소별 성범죄자 등)이 `app/`·`lib/` 에 들어가면 실패.

## 관련 UI

- 구 스냅샷 칩: `치안지수 N(행정구역 집계)` (`district-workspace-service.ts`)  
- 개인정보처리방침: `/legal/privacy` 민감 공공데이터 조항
