# 캐시 감사 — 유입 상위 경로 (2026-09-01, 실사용50 #35)

프로덕션 실측(Playwright, 응답 헤더). 목적: 카페 글 스파이크(시간당 수천 방문)가
홈·단지·목록을 통해 DB 를 직격하지 않는지.

| 경로 | cache-control | x-vercel-cache | 판정 |
|---|---|---|---|
| / | s-maxage=60, SWR 600 | STALE(age 150) | ✅ 엣지가 흡수 — 스파이크 안전 |
| /town | s-maxage=60, SWR 600 | STALE | ✅ 동일 |
| /guides/* | s-maxage=3600, SWR 86400 | PRERENDER | ✅ 정적 |
| /region/[id] | s-maxage=3600, SWR 86400 | MISS→HIT | ✅ ISR |
| /analysis/gap | no-store (PRERENDER) | PRERENDER | ✅ 프리렌더 셸 |
| /search | no-store | HIT(age 1937) | ✅ 셸 캐시 + 클라이언트 데이터 |
| /map | no-store (force-dynamic) | MISS | ⚠️ 함수 호출은 매 방문 — 단, 무거운 배치 조회 3종은 unstable_cache 600s(938) + last-good 이라 DB 직격은 아님. 남는 비용은 함수 실행뿐(Vercel 스케일 영역) |
| /notes | no-store (force-dynamic) | MISS | 🔧 **수리함(945)** — 비로그인 공개 피드 목록을 unstable_cache 60s 로 묶음. 이전에는 방문마다 listPublicNotes 실조회 |
| /login·/subscription | no-store | MISS | ✅ 의도된 동적(세션) — 스파이크 표적 아님 |

## 결론

- 스파이크 1순위 표적(홈·동네·가이드·지역·단지 상세)은 전부 엣지/ISR 뒤에 있다.
- 단지 상세(/complex/[id])는 ISR + 조회 cache() 통합(기존 감사) — 이번 표에서는 생략.
- 남은 리스크는 "함수 동시 실행 비용"(Vercel)이지 DB 가 아니다. DB 직격 경로였던
  /notes 공개 피드는 이번에 60초 캐시로 수리.
- 부하 시나리오 실측(동시 수백 요청)은 소유자 과금 영향이 있어 미실시 —
  실제 스파이크 발생 시 Vercel 함수 동시성 그래프로 사후 검증한다.

재감사 시점: 카페 배포(플레이북 #29) 첫 실행 주간의 실트래픽으로.
