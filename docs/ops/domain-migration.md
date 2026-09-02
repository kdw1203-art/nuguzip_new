# 도메인 전환 런북 — nuguzip.com → (새 도메인) · 실행 준비 완료 상태

> [947] 코드는 전환 준비가 끝났다: canonical·sitemap·robots·RSS·JSON-LD·인증
> 리다이렉트가 전부 `DEFAULT_DESKTOP_ORIGIN` 한 곳에서 나오고, 이 값은
> `NEXT_PUBLIC_SITE_ORIGIN` env 로 덮인다. 구 도메인으로 온 요청은 미들웨어가
> 자동 308 리다이렉트한다(env 전환만으로 켜짐).
>
> 아래 ①~③은 소유자만 할 수 있는 일(구매·DNS·콘솔), ④~⑤는 지시만 주면
> 세션(Claude)이 수행한다.

## 사전 확인

- 새 도메인 후보(예: naejipnow.com / naejipnow.kr / njnow.kr)의 등록 가능 여부·가격은
  가비아/Cloudflare Registrar 등에서 소유자가 직접 확인·구매한다.
- 전환은 되돌리기 어렵다 — 색인·공유링크·광고 UTM이 새 도메인으로 갈리기 시작한다.
  구매 후 **최소 6개월 이상 구 도메인을 유지**하며 308을 받게 두는 것을 전제로 한다.

## ① 소유자 — 도메인·DNS (30분)

1. 새 도메인 구매.
2. Vercel → 프로젝트(prj_hsE8uEG7QyxefafQpVnKx6diCVqO) → Settings → Domains:
   - 새 도메인 추가 → **Primary** 로 지정, `www.` 변형도 추가(리다이렉트로 설정).
   - 기존 nuguzip.com 은 **삭제하지 않는다** — 그대로 두면 같은 배포를 서빙하고,
     미들웨어가 새 도메인으로 308 시킨다.
3. DNS(구매처): Vercel 이 안내하는 A/CNAME 레코드 적용.

## ② 소유자 — Vercel env 전환 (5분, 이게 스위치다)

- Vercel → Settings → Environment Variables (Production):
  - `NEXT_PUBLIC_SITE_ORIGIN` = `https://새도메인` (끝 슬래시 없이)
- 재배포(다음 deploy부터 적용). 이 순간부터:
  - canonical/sitemap/robots/RSS/JSON-LD/메타데이터가 새 도메인으로 나간다.
  - nuguzip.com 으로 온 모든 요청이 경로 보존 308 로 새 도메인에 간다.

## ③ 소유자 — 외부 콘솔 갱신 (60~90분, 순서 무관)

| 서비스 | 할 일 |
|---|---|
| Google Search Console | 새 도메인 속성 추가(DNS TXT) → 구 속성에서 **주소 변경 도구** 실행 → 새 속성에 sitemap.xml 제출 |
| 네이버 서치어드바이저 | 새 도메인 등록·소유확인 → 사이트맵 제출 |
| Google OAuth (Cloud Console) | 승인된 리디렉션 URI에 `https://새도메인/api/auth/callback/google` 추가 (구 URI 유지) |
| 카카오 개발자 | 플랫폼 사이트 도메인 + Redirect URI `https://새도메인/api/auth/callback/kakao` 추가, 공유 디버거에서 구·신 URL 캐시 초기화 |
| 토스페이먼츠 | 상점 정보의 서비스 URL 변경 신고(심사 고지 사항), successUrl/failUrl 은 코드가 요청 origin 기준이라 자동 |
| 토스 로그인(별도 흐름) | 등록된 리다이렉트 origin에 새 도메인 추가 |
| Supabase Auth | Authentication → URL Configuration: Site URL을 새 도메인으로, Redirect URLs에 `https://새도메인/**` 추가 (구 항목 유지) |
| Resend(개통 시) | 새 도메인 발신 인증(SPF/DKIM) 후 `EMAIL_FROM` 갱신은 ④에서 코드로 |
| GA4 / Vercel Analytics | 데이터 스트림 URL 갱신(측정은 도메인 무관하게 이미 수집됨) |
| AdSense | 사이트 목록에 새 도메인 추가·검토 |

## ④ 세션(Claude) — 코드 문자열 일괄 전환 (지시 시 1커밋)

env 가 정본이지만, 이메일 본문·봇 발행 글·llms.txt·가이드 문서 등에 **표시용
절대 URL 문자열**이 약 188곳 남아 있다(2026-09-02 실측 80파일). 새 도메인이
확정되면 아래 한 번으로 끝난다:

```bash
grep -rl "nuguzip\.com" app lib components public scripts docs \
  | xargs perl -pi -e 's/(?<![-\w])nuguzip\.com/새도메인/g'
# 제외 확인: supabase env(FALLBACK_SUPABASE_URL)·과거 migrations·계정 이메일
# (nuguzip@naver.com, test@nuguzip.com)은 치환 대상이 아니다 — diff 리뷰 필수.
```

+ `EMAIL_FROM`(lib/email/send.ts)의 발신 주소를 새 도메인 계정으로,
+ e2e/smoke 의 도메인 단언, `docs/` 러닝 문서 갱신, 게이트 빌드 후 zip 납품.

## ⑤ 세션(Claude) — 전환 후 실측 (지시 시)

- 구 도메인 10개 경로 308 → 새 도메인 200 확인(리다이렉트 체인 1홉인지).
- canonical/OG/sitemap 이 새 도메인인지 프로덕션 응답으로 검증.
- GSC 색인 추이 주간 리포트에 "주소 변경" 섹션 추가.

## 주의 — 하지 말 것

- 구 도메인 삭제·만료 방치(색인·공유링크·명함이 전부 죽는다).
- GSC 주소 변경 도구 없이 새 속성만 만드는 것(색인 승계가 안 된다).
- 전환과 동시에 대규모 콘텐츠 개편(원인 분리가 안 된다 — 전환 단독으로).
