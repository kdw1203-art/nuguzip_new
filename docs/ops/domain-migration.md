# 도메인 전환 런북 — nuguzip.com → naezipnow.com (951→954)

> 상태(954 · 2026-09-03): **도메인 구매 완료**(Vercel 등록, 만료 2027-09-03, 자동갱신 ON, 네임서버 Vercel,
> Vercel CDN Active). 코드는 954 에서 `scripts/domain-switch.mjs naezipnow.com` 으로 전환 완료
> (126파일·343곳, 기본 origin 갱신). 남은 것은 ① 프로젝트 연결(Connect) ② 배포 ③ env
> `NEXT_PUBLIC_SITE_ORIGIN` ④ 외부 콘솔 ⑤ 세션의 DB·트리거 정리 순서다.

## 상태 로그

- 2026-09-02 951: 코드 선전환 → 952 되돌림(구매 전 배포 방지) + 스크립트화.
- 2026-09-03 08:xx KST: 소유자가 Vercel 대시보드에서 구매(예정 9/8 보다 앞당김). 구매 직후 화면:
  "No projects on this team are using this domain" — **연결 전**. DNS 는 CAA 3건만 존재(정상, Vercel 기본).
- 2026-09-03 954: 전환 커밋. 9/8 예약 점검은 "구매 안내"에서 "전환 검증·정리"로 역할 변경.

## 코드에서 준비된 것

- `lib/platform-shell.ts` 기본 origin 은 env `NEXT_PUBLIC_SITE_ORIGIN` 우선. 스크립트가 기본값을 바꾼다.
- `scripts/domain-switch.mjs`: 표시용 절대 URL 문자열을 일괄 치환(app·lib·tests·scripts·workflows·public·docs).
  건드리지 않는 것: `supabase/migrations`(과거 기록), `middleware.ts` 구 도메인 목록(리다이렉트 표),
  워크플로의 `/api/cron/` 호출 줄, `lib/vworld/client.ts`, 계정 이메일(`@nuguzip.com`·`@noreply.nuguzip.com`·nuguzip@naver.com).
- 미들웨어: 구 도메인(nuguzip.com·www·m) → 새 도메인 308 은 **env 가 설정된 뒤에만** 켜진다.
  새 도메인을 붙이기 전에 배포돼도 nuguzip.com 은 계속 정상 서빙된다(안전장치).
- vercel.json 의 `m.nuguzip.com` 고정 리다이렉트 삭제(미들웨어가 맡는다).
- **ETL 크론 주소는 구 도메인 유지**: `.github/workflows/etl.yml`·`backfill.yml` 의 `/api/cron/*` 호출은
  `https://nuguzip.com/...` 그대로 두고, 미들웨어의 구 도메인 308 은 `/api/cron/*` 를 예외로 한다.
  (curl 은 308 을 따라가지 않아 파이프라인이 통째로 멈추는 사고를 막는다.) 새 도메인이 6개월 이상
  안정되면 워크플로 주소를 옮긴다.

## ① 소유자 — 프로젝트 연결 (3분, 954 적용 전에)

구매는 끝났다. 대시보드 https://vercel.com/kdw1203-arts-projects/~/domains/naezipnow.com 의
**Connected Projects → Connect** → 프로젝트 `nuguzip-homepage` 선택. 그 다음 프로젝트
Settings → Domains 에서 `www.naezipnow.com` 도 추가하고 "Redirect to naezipnow.com" 으로 둔다.
CLI 로는:

```
npx.cmd vercel domains add naezipnow.com nuguzip-homepage
npx.cmd vercel domains add www.naezipnow.com nuguzip-homepage
```

Vercel 에서 산 도메인은 DNS 가 자동(A/CNAME 이 프로젝트 연결 시 생성)이라 보통 몇 분 안에 https 까지 뜬다.
**nuguzip.com 은 프로젝트에서 빼지 않는다** — 최소 6개월 308 로 유지(색인·공유 링크·크론 호출).

연결이 먼저인 이유: 954 코드는 canonical·sitemap·OG·이메일 링크를 naezipnow.com 으로 쓴다. 연결 전에
배포되면 그 링크들이 아직 없는 호스트를 가리킨다(308 은 env 전까지 안 켜지므로 사이트 자체는 안 죽는다).

## ② 소유자 — 코드 적용 + 스위치 (10분)

1. 954 zip 적용 → `npm.cmd run build` → 커밋 → `git push` → `npx.cmd vercel --prod`
   (release-process.md v2: Actions 가 초록이면 CLI 배포는 생략 가능).
2. 배포가 끝나면 Vercel → Settings → Environment Variables (Production):
   `NEXT_PUBLIC_SITE_ORIGIN` = `https://naezipnow.com` (끝 슬래시 없이) → **Redeploy**.
   이 순간부터 nuguzip.com 으로 온 모든 요청이 경로 보존 308 로 naezipnow.com 에 간다
   (`/api/cron/*` 제외 — 워크플로 크론 33곳은 구 도메인 직접 호출을 유지).
3. 확인: `https://naezipnow.com/` 200, `https://nuguzip.com/map` → 308 → `https://naezipnow.com/map`,
   홈 `<link rel="canonical">` 이 새 도메인, `https://naezipnow.com/sitemap.xml` 의 URL 이 새 도메인.

## ③ 소유자 — 외부 콘솔 (60~90분, 순서 무관)

| 서비스 | 할 일 |
|---|---|
| Supabase Auth | Authentication → URL Configuration: Site URL `https://naezipnow.com`, Redirect URLs 에 `https://naezipnow.com/**` 추가(구 항목 유지). 안 하면 이메일 인증·비밀번호 재설정 링크가 구 도메인으로 간다 |
| Google OAuth | 승인된 리디렉션 URI 에 `https://naezipnow.com/api/auth/callback/google` 추가, 승인된 JavaScript 원본에 `https://naezipnow.com` |
| 카카오 개발자 | 플랫폼 Web 사이트 도메인 `https://naezipnow.com`, Redirect URI `https://naezipnow.com/api/auth/callback/kakao`, 공유 스크랩 캐시 초기화 |
| Google Search Console | 새 속성(도메인 속성, DNS TXT) 추가 → 구 속성에서 **주소 변경** 실행 → 새 속성에 `https://naezipnow.com/sitemap.xml` 제출 |
| 네이버 서치어드바이저 | 새 도메인 등록·소유확인 → 사이트맵 제출 |
| 토스페이먼츠 | 상점 서비스 URL·서비스명(내집나우) 변경 신고. successUrl/failUrl 은 요청 origin 기준이라 자동 |
| Resend(개통 시) | naezipnow.com 발신 도메인 인증(SPF/DKIM) 뒤 Vercel env `EMAIL_FROM=내집나우 <noreply@naezipnow.com>`. 코드는 env 우선, 없으면 구 주소(인증 전 전환 방지) |
| AdSense · GA4 | 사이트 목록·데이터 스트림 URL 에 새 도메인 추가 |
| VWorld(브이월드) | 인증키 관리에서 서비스 도메인을 `naezipnow.com` 으로 변경 → Vercel env `VWORLD_API_DOMAIN=https://naezipnow.com`. 그 전까지 코드는 구 도메인으로 호출한다(키 불일치 방지) |
| IndexNow | 키 파일(`public/<key>.txt`)은 도메인 무관 — 새 도메인에서 그대로 서빙되므로 할 일 없음 |

## ④ 세션 — 스위치 뒤 정리 (지시 또는 예약 점검에서 자동)

- DB 표시 문자열: 공지(notices)·자동 뉴스 본문 링크(board_posts)·automation_scripts 의 `nuguzip.com` → `naezipnow.com` (SQL, 되돌릴 수 있게 rollback 표 남김).
- 예약 트리거 8개 프롬프트의 도메인 표기 갱신.
- Lab 카드 이미지(lab-cards 290장)의 하단 `nuguzip.com`·`누구집 Lab` 표기는 **이미지 재생성**이 필요하다 — Lab 트리거에 일회성 재생성 작업을 지시(세션은 스토리지 쓰기 권한이 없다).
- 검증: sitemap·robots·RSS·OG·canonical 이 새 도메인인지, 구 도메인 308 이 경로를 보존하는지 curl 로 표본 확인.

## 되돌리기

env `NEXT_PUBLIC_SITE_ORIGIN` 을 지우고 재배포하면 코드 기본값(naezipnow.com)이 canonical 이 되지만 308 은 꺼진다.
완전 복귀는 951 zip 이전 커밋(da9500a)으로 revert.
