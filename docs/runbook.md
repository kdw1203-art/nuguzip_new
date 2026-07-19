# 누구집(nuguzip.com) 운영 런북

프로덕션: https://nuguzip.com (Vercel, `icn1` 리전 / Next.js App Router / Supabase)
배포 파이프라인: `.github/workflows/deploy.yml` (main 푸시 → 프로덕션, 그 외 브랜치 → 프리뷰)
합성 모니터링: `.github/workflows/synthetic.yml` (UTC 21시·9시 = KST 06시·18시, 핵심 URL 5개 + `/api/health`)

---

## 1. 배포 실패

배포 워크플로(`Deploy to Vercel`)가 실패하면 **"Report deploy failure" 스텝이 배포 로그 끝부분(3000자)을 담아 GitHub 이슈를 자동 생성**한다 (제목: `Deploy failure <UTC 시각>`).

1. 자동 생성된 이슈 확인 — 본문에 run id와 `deploy.log` tail이 있다. 이슈가 없다면 Actions 탭에서 실패한 run을 직접 연다.
2. 실패 스텝별 원인 분류:
   - **Secret scan (gitleaks)**: 커밋에 시크릿이 감지됨. 해당 시크릿을 즉시 로테이션하고, 히스토리에서 제거(또는 `.gitleaksignore`에 오탐 등록) 후 재푸시.
   - **Build for link check / Link integrity check**: 앱 자체 빌드 오류나 깨진 내부 링크. `npx next build` + `PORT=3100 node scripts/check-links.mjs` 로컬 재현.
   - **Sync ... env / Pull Vercel environment**: `VERCEL_TOKEN` 시크릿 만료 가능성 — 저장소 Settings → Secrets → Actions에서 갱신.
   - **Build / Deploy (vercel)**: Vercel 측 문제 또는 무료 플랜 한도. 로그의 오류 메시지와 https://www.vercel-status.com 확인.
3. 일시적 오류(네트워크, Vercel 순단)로 판단되면 재실행:
   ```bash
   gh run rerun <run-id> --failed   # 실패한 잡만 재실행 (rerun-failed-jobs)
   ```
   또는 Actions UI에서 "Re-run failed jobs".
4. 해결 후 자동 생성 이슈를 닫는다(자동으로 닫히지 않음).

## 2. 프로덕션 롤백

두 가지 경로가 있다. **긴급 시 Instant Rollback 먼저, 그다음 git revert로 원인 커밋 제거.**

### 2-1. Vercel Instant Rollback (수 초, 코드 변경 없음)
1. Vercel 대시보드 → 해당 프로젝트(`prj_hsE8uEG7QyxefafQpVnKx6diCVqO`) → Deployments.
2. 마지막 정상 프로덕션 배포를 찾아 "…" 메뉴 → **Instant Rollback** (또는 "Promote to Production").
3. https://nuguzip.com 과 `/api/health`(status가 `ok`인지)로 복구 확인.
4. 주의: Instant Rollback은 배포 산출물만 되돌린다 — **환경변수·Supabase 데이터는 되돌아가지 않는다.** 또한 main에는 여전히 문제 커밋이 남아 있으므로 다음 푸시에서 다시 배포된다 → 반드시 2-2를 이어서 수행.

### 2-2. git revert (근본 조치)
```bash
git revert <문제 커밋 SHA>   # 머지 커밋이면: git revert -m 1 <SHA>
git push origin main          # 푸시 → deploy.yml이 자동으로 프로덕션 재배포
```
배포 워크플로가 통과하고 새 배포가 프로덕션으로 승격되면 Instant Rollback 상태는 자연스럽게 대체된다.

## 3. Supabase 장애

### 상태 확인
1. https://status.supabase.com 에서 플랫폼 장애 여부 확인.
2. 프로젝트 자체 확인: `https://pbhiskvwpwwhtkmnhkbm.supabase.co` (Supabase 대시보드 → 프로젝트 Health/Logs).
3. 앱 관점 확인: `https://nuguzip.com/api/health` — `checks.db.ok`가 `false`면 DB 접근 실패, `checks.env.ok`가 `false`면 URL/키 env 문제.
4. 로컬 진단 스크립트: `node scripts/check-supabase.mjs` (`.env.local` 필요).

### 앱의 폴백 구조 (장애 시 기대 동작)
- 서버 데이터 로더는 `lib/newui/supabase-read.ts`의 `getReadOnlySupabase()`를 사용한다: **Service Role 키 우선, 없거나 무효하면 anon(publishable) 키로 폴백**, 둘 다 없으면 `null` 반환. 이 경로는 읽기 전용이다.
- 각 페이지는 try/catch + 목업 데이터 폴백을 유지하므로 Supabase가 완전히 죽어도 **페이지는 목업 콘텐츠로 렌더링되어야 정상**이다. 페이지가 500을 내면 폴백 누락 버그이므로 별도 이슈로 처리.
- 따라서 Supabase 장애의 주 증상은 "다운"이 아니라 **오래된/목업 데이터 표시 + `/api/health` status `degraded`**다.

### 조치
- Service Role 키가 무효해진 경우: Supabase 대시보드에서 재발급 → GitHub Secret `SUPABASE_SERVICE_ROLE_KEY` 갱신 → main 재배포(deploy.yml의 "Sync service role env" 스텝이 Vercel env에 반영).
- anon(publishable) 키·URL은 deploy.yml의 "Sync public Supabase env" 스텝이 매 배포마다 정정한다.

## 4. 크론/ETL 중단

크론은 **Vercel Crons**(`vercel.json`)로 동작한다:

| 경로 | 스케줄 (UTC) |
|---|---|
| `/api/cron/attendance-reminders` | 매일 10:00 |
| `/api/cron/reb-ingest` | 3일마다 06:00 |
| `/api/cron/kb-ingest` | 3일마다 06:30 |
| `/api/cron/kosis-ingest` | 3일마다 06:45 |
| `/api/cron/complex-crawl` | 3일마다 07:00 |
| `/api/cron/molit-transactions-ingest` | 매월 1일 04:00 |

1. **감지**: `https://nuguzip.com/api/health`의 `checks.etl` 확인 — `market_ingest_log`의 마지막 성공(status=ok)이 **48시간**보다 오래되면 `ok: false`(→ 전체 status `degraded`, 합성 모니터링이 이슈 생성). `lastSuccessAt`으로 마지막 성공 시각 확인.
2. **크론 실행 로그**: Vercel 대시보드 → 프로젝트 → Settings/Observability → **Cron Jobs**에서 최근 실행·응답코드 확인. 함수 오류는 Logs(Functions)에서 `/api/cron/*` 필터.
3. **수동 재실행**: 해당 크론 엔드포인트를 직접 호출해 재수행 가능(핸들러는 `app/api/cron/*/route.ts`). 인증 헤더가 필요한 경우 핸들러 코드에서 요구 조건 확인.
4. 외부 API 키 문제(국토부·KOSIS·서울열린데이터 등)는 `/api/health?detail=1`(운영에서는 `HEALTHCHECK_TOKEN` 필요)의 `publicData` 섹션으로 어느 키가 비었는지 확인.

## 5. 도메인/SSL

- 프로덕션 도메인 `nuguzip.com`은 Vercel 프로젝트에 연결. `m.nuguzip.com`은 `vercel.json` redirects로 `https://nuguzip.com`에 301 리다이렉트.
- SSL 인증서는 Vercel이 자동 발급·갱신(Let's Encrypt) — 수동 갱신 작업 없음.
- 장애 시 점검 순서:
  1. `curl -sI https://nuguzip.com` — TLS 핸드셰이크/응답코드 확인.
  2. Vercel 대시보드 → 프로젝트 → Settings → **Domains**: 도메인 상태가 Valid인지, 인증서 갱신 오류 배너가 없는지.
  3. DNS: `dig nuguzip.com +short` 결과가 Vercel(A 76.76.21.21 또는 CNAME cname.vercel-dns.com)을 가리키는지. 아니면 도메인 등록기관의 네임서버/레코드 확인.
  4. 도메인 만료 여부(등록기관 대시보드) 확인.
- `www` 등 서브도메인 문제는 Domains 화면에서 리다이렉트 설정 확인.

## 6. 비상 연락 순서

1. **서비스 오너/운영 담당** — kdw1203@gmail.com (1차, 모든 인시던트).
2. **GitHub 이슈** — 자동 생성 이슈(배포 실패·합성 모니터링)에 진행 상황을 코멘트로 남겨 기록 일원화.
3. **Vercel** — https://www.vercel-status.com 확인 후, 플랫폼 문제면 Vercel Support(대시보드 Help).
4. **Supabase** — https://status.supabase.com 확인 후, 프로젝트 문제면 대시보드 → Support 티켓.
5. **도메인 등록기관** — DNS/만료 문제 시 등록기관 지원 채널.

> 원칙: 사용자 영향이 있는 장애는 먼저 **롤백(§2)으로 복구**하고, 원인 분석은 그 후에 한다.
