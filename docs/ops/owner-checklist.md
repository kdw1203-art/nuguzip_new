# 소유자 체크리스트 — 세션이 대신할 수 없는 것 (2026-09-02 기준)

> 아래는 전부 **대시보드 로그인·결제·계약이 필요한 일**이라 세션(AGENT)이 할 수 없다.
> 순서는 급한 순. 각 항목의 코드·문서 쪽 준비는 끝나 있어 값만 넣으면 켜진다.

## 오늘 안에 (10분)

| # | 할 일 | 어디서 | 왜 |
|---|---|---|---|
| 1 | Resend 가입 → API 키 발급 → Vercel 환경변수 `RESEND_API_KEY` 와 `ALERT_EMAIL_TO=<받을 메일>` 추가 → 재배포 | resend.com · Vercel → Settings → Environment Variables | 지금은 장애·신선도 경보가 **아무에게도 안 간다**. 환영 메일·관심단지 거래 알림도 같은 통로 |
| 2 | Supabase Vault 에 `cron_secret` 등록 (값 = Vercel 의 `CRON_SECRET` 과 동일) | Supabase → Project → Integrations → Vault → New secret (name `cron_secret`). 또는 SQL Editor 에서 `select vault.create_secret('<CRON_SECRET 값>', 'cron_secret');` | 자동결제 갱신 크론이 8/26 부터 매 실행 실패(ops.health_alert_log). 유료 구독자가 생기면 갱신이 안 된다. 값은 세션에 보내지 말 것 |

## 이번 주

| # | 할 일 | 어디서 | 메모 |
|---|---|---|---|
| 3 | 외부 업타임 모니터 등록: `https://nuguzip.com/api/health` 1분 간격, 알림 = 위 이메일 | UptimeRobot(무료) 등 | 내부 프로브(site-probe)는 사이트가 통째로 죽으면 같이 죽는다 |
| 4 | Vercel Web Analytics 켜기 | Vercel → Project → Analytics → Enable | 유입 경로·경로별 방문을 표준 도구로. 켜지면 세션이 `@vercel/analytics` 를 연결한다 |
| 5 | Vercel 지출 상한 알림 · Supabase 용량 알림 | Vercel → Settings → Billing → Spend Management / Supabase → Billing | 크롤러 한 마리가 청구서를 바꾼다(단지 페이지 6천 회/일 실측) |
| 6 | 카카오 로그인: 카카오 개발자 앱 생성 → REST 키·Client Secret → Vercel `AUTH_KAKAO_ID`·`AUTH_KAKAO_SECRET`, Redirect URI `https://nuguzip.com/api/auth/callback/kakao` | developers.kakao.com | 코드는 946 에 있고 키만 없으면 버튼이 숨는다 |
| 7 | 구글 OAuth 동의 화면 앱 이름 → "내집나우" | Google Cloud Console → OAuth consent screen | 로그인 창에 옛 이름이 뜬다 |
| 8 | Supabase Auth 이메일 템플릿(가입 확인·비밀번호 재설정·매직링크) 문구의 브랜드 → 내집나우 | Supabase → Authentication → Email Templates | 대시보드 전용 — 코드로 못 바꾼다 |
| 9 | 토스페이먼츠 상점(서비스)명 변경 신고 | 토스 개발자센터/상점 관리 | 결제창 브랜드 불일치 |
| 10 | 카카오톡 공유 미리보기 캐시 초기화 | developers.kakao.com → 도구 → 스크랩 캐시 | 옛 OG 이미지가 남아 있다 |

## 결정이 필요한 것

| # | 결정 | 준비 상태 |
|---|---|---|
| 11 | **새 도메인** 선택·구매 | 코드는 `NEXT_PUBLIC_SITE_ORIGIN` 하나로 전환되고 구 도메인은 자동 308(947). 절차: docs/ops/domain-migration.md |
| 12 | `INGEST_SECRET` 회전 여부 | 대화에 값이 오간 적이 있어 원칙상 회전 대상(docs/ops/secrets-policy.md). 자동화 스크립트가 같은 값을 쓰므로 함께 교체해야 한다 |
| 13 | 크롤러 차단 표 확정 | 950 에서 SEO 도구·스크레이퍼 12종을 robots+엣지에서 막았다. 949 의 UA 표본 로그로 정체가 확인되면 표를 넓히거나 줄인다 |
| 14 | 콘텐츠 확보 주간 목표 | 공개 노트 22편이 전부 Lab 노트. community-playbook.md 의 카페 배포를 주 1회로 고정하고 "이웃 노트 N편/주"를 KPI 로 |

## 이미 되어 있는 것 (하지 않아도 됨)

- 백업 복구 리허설 문서(db-backup-drill.md), 장애 템플릿(incident-template.md), 환불 SOP(sop-refunds.md v2),
  고객 응대 기준(customer-support.md), 개인정보 요청 SOP(privacy-requests.md), 시크릿 정책(secrets-policy.md),
  릴리스 절차(release-process.md), 데이터 신선도 감시·건강 경보(ops.health_alert_log — 1번이 되면 메일로 온다),
  주간 리포트(월요 08:00Z 예약), Lighthouse CI(947), 성능 예산 게이트, 관리자 API 속도 제한, RLS 점검 스크립트.
