# 도메인 전환 런북 — nuguzip.com → naezipnow.com (951, 2026-09-02)

> 상태: **코드는 전환 완료본**(951 zip). 남은 것은 소유자 3단계(구매·연결·env)와
> 세션이 그 뒤에 하는 DB·트리거 정리다. 세션의 Vercel 토큰은 구매 권한이 없어
> (`buy_domain` → "token lacks permission to make purchases") 구매는 소유자가 한다.
> 확인 시점 가격: naezipnow.com $11.25/1년(Vercel), 미등록 상태.

## 코드에서 이미 끝난 것 (951)

- `lib/platform-shell.ts` 기본 origin → `https://naezipnow.com`. env `NEXT_PUBLIC_SITE_ORIGIN` 이 있으면 그 값이 우선.
- 표시용 절대 URL·이메일 도메인 문자열 137개 파일 일괄 치환(app·lib·tests·scripts·workflows·public·docs).
  치환하지 않은 것: `supabase/migrations`(과거 기록), `middleware.ts` 의 구 도메인 목록(이게 리다이렉트 표),
  계정 이메일(nuguzip@naver.com, test@nuguzip.com).
- 미들웨어: 구 도메인(nuguzip.com·www·m) → 새 도메인 308 은 **env 가 설정된 뒤에만** 켜진다.
  새 도메인을 붙이기 전에 배포돼도 nuguzip.com 은 계속 정상 서빙된다(안전장치).
- vercel.json 의 `m.nuguzip.com` 고정 리다이렉트 삭제(미들웨어가 맡는다).
- **ETL 크론 주소는 구 도메인 유지**: `.github/workflows/etl.yml`·`backfill.yml` 의 `/api/cron/*` 호출은
  `https://nuguzip.com/...` 그대로 두고, 미들웨어의 구 도메인 308 은 `/api/cron/*` 를 예외로 한다.
  (curl 은 308 을 따라가지 않아 파이프라인이 통째로 멈추는 사고를 막는다.) 새 도메인이 6개월 이상
  안정되면 워크플로 주소를 옮긴다.

## ① 소유자 — 구매·연결 (10분)

PowerShell(로그인된 Vercel CLI)에서:

```
npx.cmd vercel domains buy naezipnow.com
npx.cmd vercel domains add naezipnow.com nuguzip-homepage
npx.cmd vercel domains add www.naezipnow.com nuguzip-homepage
```

또는 대시보드: https://vercel.com/domains/search?q=naezipnow.com 에서 구매 →
Project(nuguzip-homepage) → Settings → Domains → Add → `naezipnow.com`(Primary), `www.naezipnow.com`(redirect to primary).
Vercel 에서 산 도메인은 DNS 가 자동 설정돼 보통 몇 분 안에 https 까지 뜬다.
**nuguzip.com 은 삭제하지 않는다** — 최소 6개월 308 로 유지(색인·공유 링크).

## ② 소유자 — 코드 적용 + 스위치 (10분)

1. 951 zip 적용 → `npm.cmd run build` → 커밋 → `git push` (release-process.md 순서, `vercel --prod` 없이).
2. 배포가 끝나면(Actions 초록) Vercel → Settings → Environment Variables (Production):
   `NEXT_PUBLIC_SITE_ORIGIN` = `https://naezipnow.com` (끝 슬래시 없이) → Redeploy.
   이 순간부터 nuguzip.com 으로 온 모든 요청이 경로 보존 308 로 naezipnow.com 에 간다.
3. 확인: `https://nuguzip.com/map` 이 308 → `https://naezipnow.com/map`, 홈 `<link rel="canonical">` 이 새 도메인.

## ③ 소유자 — 외부 콘솔 (60~90분, 순서 무관)

| 서비스 | 할 일 |
|---|---|
| Supabase Auth | Authentication → URL Configuration: Site URL `https://naezipnow.com`, Redirect URLs 에 `https://naezipnow.com/**` 추가(구 항목 유지). 안 하면 이메일 인증·비밀번호 재설정 링크가 구 도메인으로 간다 |
| Google OAuth | 승인된 리디렉션 URI 에 `https://naezipnow.com/api/auth/callback/google` 추가, 승인된 JavaScript 원본에 `https://naezipnow.com` |
| 카카오 개발자 | 플랫폼 Web 사이트 도메인 `https://naezipnow.com`, Redirect URI `https://naezipnow.com/api/auth/callback/kakao`, 공유 스크랩 캐시 초기화 |
| Google Search Console | 새 속성(도메인 속성, DNS TXT) 추가 → 구 속성에서 **주소 변경** 실행 → 새 속성에 `https://naezipnow.com/sitemap.xml` 제출 |
| 네이버 서치어드바이저 | 새 도메인 등록·소유확인 → 사이트맵 제출 |
| 토스페이먼츠 | 상점 서비스 URL·서비스명(내집나우) 변경 신고. successUrl/failUrl 은 요청 origin 기준이라 자동 |
| Resend(개통 시) | naezipnow.com 발신 도메인 인증(SPF/DKIM). 코드의 발신 주소는 이미 `noreply@naezipnow.com` |
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
