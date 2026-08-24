# Wave 10 실측 대장 (2026-08-24)

## 렌더링·캐시 감사 (OPT-09·11 판정)
- `force-dynamic` **실제 export 61개**(이전 78 집계는 주석 매치 포함 — 정정).
  - 정당: admin 17 · my 13 · 세션/결제/작성 계열 26 · searchParams 딥링크 5 (analysis 허브 등)
  - 전환: `analysis/ai/r/[id]` → ISR 3600 (불변 스냅샷 · 빈 generateStaticParams)
  - 이 감사의 상시 게이트는 기존 `check-cache-policy.mjs` 가 담당.
- 서버측 `no-store` fetch 15곳 전수 감사: 전부 정당(토스 결제 6·인증 2·외부 수집 5·프로브 2).
  브라우저측 no-store 는 CDN 과 무관(무해). → 추가 수리 없음.

## DB (OPT-17~25 실측·판정)
- 야간 집계: 가드(6h 신선/워터마크 no-change/advisory lock)는 이미 존재.
  Wave 10에서 **단계별 ms 계측** 내장 → 첫 데이터는 오늘 19:00 UTC 실행의
  `etl_runs.params.steps`. 고래 식별 후 해당 MV만 손댄다(전면 증분화는 근거 확보 후).
- capture_data_quality_snapshot(53s): 일 1회·600s 예산 내. 중복검출 GROUP BY가
  주범(747k 전수). 백필 완주(~08-30) 후 재측정 — 지금 손대면 위험>이득.
- record_health_alerts(1.0s×시간당): 듀티 0.03%. 오너 인박스 통지·중복억제 이미 내장 → 유지.
- 파티셔닝: BRIN 부적합(백필이 물리 순서 붕괴). 월 파티션 전환은 전용 회차 런북로:
  ① 백필 완주 대기 ② partitioned 신테이블 생성 ③ 야간 창(01:40~06:00 UTC 사이
  쓰기 없음 실측)에 잠금 복사·스왑 ④ 인덱스·권한·RLS 재생성 검증 ⑤ 집계 재실행.
- 커넥션(OPT-25): max 60 · 실측 23(활성 1·유휴 14) — 여유 62%. 이상 없음 종결.
- DB 총 1,439MB (market_transactions 1,172MB).

## 이미 구축돼 있어 "종결" 처리한 항목 (로드맵 근거 낡음 — 정직 기록)
- OPT-34 즉시 알림: ops.record_health_alerts 가 매시 critical 을 오너 인박스로 통지(20h dedup).
- OPT-39 보존 정책: pg_cron `telemetry-retention-daily` — web_vitals 180d ·
  activity/page_view 365d · market_ingest_log 180d.
- OPT-42 슬로우쿼리 추세: pg_cron `query-load-snapshot-daily` — pg_stat_statements
  global+top25 일일 스냅샷(ops.query_load_snapshot, 180d 보존).
- OPT-03 폰트: Pretendard dynamic-subset + 비차단 스왑 + preconnect 완비(84% 절감 실측 주석).
- OPT-07 서드파티: 지도 SDK는 지도 마운트 시에만 로드. 추가 서드파티 없음.
- OPT-08 리전: Vercel functions `icn1` 고정(vercel.json) — Supabase ap-northeast-2 와 동일 권역.
- OPT-13 단지 ISR: complex/[id] 는 이미 ISR 3600 + 빈 generateStaticParams(2026-07-28 교훈).

## 미사용 인덱스 정책 (OPT-20)
- 원칙: 미사용 인덱스의 실비용 = 쓰기 증폭 × 그 테이블의 쓰기량. 쓰기 없는 테이블은 0.
- 1차(오늘): 쓰기 활발 12개 드랍. 원본 정의는 ops.index_cleanup_20260824 (165개 전부).
- 2차: 분기마다 idx_scan 재확인 — 여전히 0이고 쓰기가 생긴 테이블만 추가 드랍.

## 번들·클라이언트 (OPT-26~32 판정)
- 지도: ComplexInfoPanel(936줄)·매물 미리보기·히스토그램·코치마크는 **이미 내부 지연 로드**.
  Wave 10은 map-client 전체를 클라이언트 경계(MapClientLazy, ssr:false)로 분리 —
  /map 첫 페인트가 지도 JS 파싱을 기다리지 않고, 4,578줄 SSR 비용 제거.
- NoteForm: VoiceMemoRecorder 지연 로드 분리. Workbench: 결과 갱신 startTransition(OPT-50).
- 게이트 신설: check:bundle-budget(라우트별 First-Load 상한, 빌드 체인) ·
  check:import-hygiene(lucide 배럴 임포트 차단, 빌드 체인) · check:perf(서버 기동 스모크, 수동/회차).
- "use client" 214파일 감사: 훅·핸들러 0인 파일 16개(~1,000줄) — 각각 소형이라
  전환 이득 미미. 경계 대체로 정당 판정, 전환 보류(목록은 이 감사로 갈음).
- prefetch(OPT-32): 대량 Link 팜 실측 결과 없음(피드 2·목록 소형) — Next 기본 유지 종결.

## 파이프라인 (OPT-33~38 판정)
- 스케줄러 일원화(OPT-33): **완료** — 근거는 08-23 GH 스케줄 하루 결번 vs Vercel 9일 정시.
  매일 수집 6종(molit 당월·reb·kb·complex-crawl·geocode·apt-detail)은 Vercel,
  GH etl 은 molit 직전월 보강 + 나머지 수집·주간 잡·alerts. 튜닝 limit 은 vercel.json
  쿼리스트링으로 이관. 데이터.go.kr 일일 쿼터 소모도 절반이 된다.
- 스토리지 GC(OPT-36): 실측 — 전 버킷 합계 ~20MB(대부분 lab-cards 226개)·고아 무시 수준.
  GC 크론은 과잉 설계 판정, 분기 재실측으로 종결.
- API 감사(OPT-35): 라우트 297개 정적 감사는 위험(참조 없음 ≠ 미사용: 외부 웹훅·RSS·OG).
  실호출 계측 없이 퇴역하지 않는다 — Vercel 대시보드 호출 통계 확인 후 후속(판정 기록).
- 백필 연쇄(OPT-37): 진행 중 백필은 뉴스 요약(집계 무관·자기 종료 내장)뿐.
  집계는 원천 워터마크 가드가 변화를 자동 감지 — 연쇄 장치 불필요 판정 종결.
- 페이로드 슬림(OPT-38): 최다 히트는 DB 인덱스 조회(complex_tx_stats 7.2M)로 API 전송량과
  별개. API 슬리밍은 OPT-01 경로별 실측에서 무거운 응답이 특정되면 표적 수리(후속).

## 체감 속도 나머지 (OPT-02·04 판정)
- 홈에 <img> 0개 — LCP 는 텍스트/카드일 가능성. 프리로드·fetchpriority 는
  attribution(OPT-01) 범인 확정 후 표적 적용이 정답(추측 프리로드는 대역폭 낭비).
- next/image 도입(OPT-04): remotePatterns 준비 완료. LCP 범인이 이미지로 확정되면
  그 표면부터 적용(전면 전환은 시각 회귀 위험 > 근거 없는 이득).

## Wave 10 신설 표면
- /admin/perf — 경로×지표 p75 매트릭스 + LCP 범인 Top10 (OPT-41)
- /api/me/home-brief + 홈 워치리스트 브리핑 카드 (OPT-47)
- /api/metrics/client-error + 전역 수집기 (OPT-43)
- 단지 허브 "시장 축 요약" 섹션 — 워크벤치 컨텍스트 재사용 (OPT-48)
- 워크벤치 단일 단지 딥링크(?complexId·?apt&region) — AI-40 배너 결합부 완성 (OPT-48)
- site-probe 핵심 4경로 응답시간 기록 (OPT-44) · ⌘K 검색 (OPT-45 보강)
