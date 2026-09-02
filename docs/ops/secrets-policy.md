# 시크릿 관리 정책 v1 · 2026-09-02

> 원칙 한 줄: **비밀값은 대시보드에만 산다.** 채팅·문서·커밋·스크린샷에는 절대 없다.

## 어디에 두나

| 종류 | 보관 위치 | 읽는 쪽 |
|---|---|---|
| Vercel 런타임 키(AUTH_SECRET, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, INGEST_SECRET, RESEND_API_KEY, AUTH_KAKAO_*, 지도·공공 API 키) | Vercel → Project → Settings → Environment Variables | 서버 코드 |
| GitHub Actions 가 배포 때 Vercel 에 밀어 넣는 키 | GitHub → Settings → Secrets and variables → Actions | deploy.yml |
| DB 안에서 쓰는 비밀(pg_cron 이 호출할 CRON_SECRET) | Supabase → Vault (`cron_secret`) | run_billing_renewals 등 |
| 결제사 키(토스) | 토스 개발자센터 + Vercel 환경변수 | docs/ops/toss-keys.md |

공개돼도 되는 값(NEXT_PUBLIC_*, publishable anon key)은 시크릿이 아니다 — RLS 가 지킨다.

## 규칙

1. **AGENT(세션)에게 비밀값을 보내지 않는다.** 세션은 값을 받아도 쓰지 않고, 필요한
   자리를 "어느 화면의 어느 칸"으로만 안내한다. 세션이 값을 요구하면 그 요구가 잘못된 것이다.
2. 새 키는 만든 사람이 직접 대시보드에 넣는다. 이름(변수명)만 세션과 공유한다.
3. 회전(rotation) 주기: 서비스 롤 키·CRON_SECRET·INGEST_SECRET 은 **분기 1회**, 외부 API 키는
   제공자 정책, 유출 의심 시 **즉시**. 회전 순서: 새 값 발급 → Vercel 등록 → 재배포 →
   구 값 폐기.
4. 유출 의심(채팅·커밋·로그에 값이 보임): 그 자리에서 회전한다. "아마 괜찮다"는 판단을 하지 않는다.
5. 로그에 값이 찍히지 않게 `lib/log.ts` 가 마스킹한다 — 새 로그를 추가할 때 헤더·쿼리스트링을
   통째로 찍지 않는다.
6. 로컬 `.env.local` 은 `.gitignore` 대상이다. 커밋 전 `git status` 에 `.env` 계열이 보이면 멈춘다.

## 이번 세션에서 확인된 것(2026-09-02)

- 대화에 INGEST_SECRET·테스트 계정 비밀번호가 오간 기록이 있다. 세션은 이를 입력하지 않았지만,
  원칙상 **INGEST_SECRET 은 회전 대상**이다 (Vercel 환경변수 + `automation_scripts` 가 쓰는
  값을 함께 바꾼다).
- Vault `cron_secret` 미등록으로 자동결제 갱신 크론이 8/26 부터 실패 중 — owner-checklist 2번.
