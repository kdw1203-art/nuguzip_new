# 통계 Open API 연동 (ECOS·KOSIS) + 입주물량 반영

## 업로드 파일 분류 (2026-02-27)

| 파일 | 성격 | 처리 |
|---|---|---|
| `260227_입주예정물량_공개용.xlsx` | **실데이터** 675행 | DB 적재(apartment_supply) + /supply·지역 허브 노출 ✅ |
| `서비스 통계목록_오픈API명세서.xls` 등 3종 | 통계 Open API 명세(조회조건/세부항목/목록) | 명세(스펙) — 아래 참고 |
| `API개발명세서_*.xls` 6종 | ECOS(한국은행) Open API 명세 | 명세(스펙) — 100대지표·통계용어사전·메타DB 등 |
| `시계열통계표 활용팁.pptx` | 사용 가이드 | 참고 자료 |

## 입주예정물량 (완료)

- 675개 단지, 17개 시도, 입주월 2026.01~2027.12, 합계 약 68만 세대.
- 테이블 `public.apartment_supply` (RLS deny-all, 서비스롤 전용).
- 화면: `/supply`(전국·시도 필터·월별 물량 차트·단지 목록), 지역 허브(`/region/[id]`)에
  "이 지역 입주 예정 물량" 섹션, GNB "지도·시세 > 입주 물량".
- 로더: `lib/market/supply.ts`.

## ECOS / KOSIS 통계 Open API (명세 → 연동 대기)

명세 파일들은 **한국은행 ECOS**(100대 통계지표·기준금리·환율·경제심리 등)와
통계 Open API의 요청 인자·응답 스키마를 정의한다. 데이터가 아니라 연동 규격.

- ECOS 기준금리는 앞서 계산기/시나리오에서 필요로 했던 값 — ECOS 인증키가 있으면 연동 가능.
- 설정: ECOS(ecos.bok.or.kr) 또는 KOSIS(kosis.kr) Open API 인증키 발급 후
  Vercel 환경변수(`ECOS_API_KEY` / `KOSIS_API_KEY`).
- 기존 `app/api/cron/kosis-ingest`는 키 활성화 전까지 `skipped` 상태(정상 폴백).

👤 사용자 액션: ECOS/KOSIS 인증키 발급 → 환경변수 등록 시 기준금리·경제지표 자동 연동.
