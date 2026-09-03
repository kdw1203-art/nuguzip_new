# 소유자만 할 수 있는 작업 — 상세 안내 (2026-07-28)

이 문서는 **제가 대신 할 수 없는 일**만 모았습니다. 코드·배포·검증은 이미 제 쪽에서
돌아가고 있고, 여기 적힌 것들은 계정 소유자만 누를 수 있는 버튼이거나(외부 서비스 가입·
키 발급), 돈이 나가는 결정이거나, 개인정보 공개 범위를 정하는 판단입니다.

모든 항목은 **2026-07-28 22:30 UTC 기준 운영 서버 실측**에 근거합니다. 근거는 각 항목에
같이 적어 두었습니다. 추정으로 적은 문장은 "추정"이라고 표시했습니다.

> **키는 이 문서나 채팅에 붙여 넣지 마세요.** 전부 Vercel 대시보드
> (Project → Settings → Environment Variables) 에 직접 입력하시면 됩니다.
> 값을 넣은 뒤에는 **재배포(Redeploy)** 해야 반영됩니다.

---

## 0. 먼저: 오늘 제가 고친 것 (참고)

로그인 화면에 카카오·네이버·구글 버튼 3개가 떠 있었는데, 운영 서버에는 그 셋 다
등록돼 있지 않았습니다. 실측:

```
$ curl https://naezipnow.com/api/auth/providers
{"password":{"id":"password","name":"이메일", ...}}          ← password 하나뿐

$ curl -I https://naezipnow.com/api/auth/signin/google
302 → /api/auth/error?error=Configuration
```

즉 **눌러야만 없다는 걸 알 수 있는 버튼**이 3개 있었습니다. 지금은 서버가 확인한
수단만 그리도록 고쳐서 배포했습니다(커밋 `81c058b`). 결과적으로 **현재 가입·로그인
경로는 이메일+비밀번호 하나뿐**입니다. 그래서 아래 1번이 최우선입니다.

---

## 1. 최우선 — 소셜 로그인 3종 등록 (반나절, 무료)

한국 서비스에서 카카오 로그인이 없는 건 가입 이탈로 바로 이어집니다. 셋 다 무료이고,
등록 절차는 서로 비슷합니다. **셋 중 하나만 하실 거면 카카오**를 먼저 하세요.

공통으로 필요한 것: 사이트 주소 `https://naezipnow.com`, 그리고 각 콘솔에 넣을
**콜백(Redirect) URI**. 콜백 주소를 한 글자라도 다르게 넣으면 로그인 직전에
에러가 납니다.

### 1-1. 카카오 로그인

| 항목 | 값 |
| --- | --- |
| 콘솔 | https://developers.kakao.com → 내 애플리케이션 → 애플리케이션 추가 |
| Redirect URI | `https://naezipnow.com/api/auth/callback/kakao` |
| 켤 것 | 제품 설정 → 카카오 로그인 **활성화 ON** / 보안 → **Client Secret 생성 + 사용 ON** |
| 동의항목 | 닉네임·프로필 사진·이메일 (이메일은 "선택 동의"로 두면 미제공 계정 대응 가능) |
| Vercel 환경변수 | `AUTH_KAKAO_ID` = REST API 키, `AUTH_KAKAO_SECRET` = Client Secret |

> Redirect URI 가 콘솔과 다르면 `KOE006` 이 뜹니다. 도메인·프로토콜(https)·경로가
> 정확히 같아야 합니다.

카카오는 하나 더 있습니다 — **카카오톡 공유**(초대 링크·노트 공유)에 쓰는
`NEXT_PUBLIC_KAKAO_JS_KEY`(JavaScript 키), 그리고 주변 중개·법무·세무 업체 조회에 쓰는
`KAKAO_REST_API_KEY`(REST API 키, 로그인용과 같은 값). 같은 앱에서 같이 발급됩니다.

### 1-2. 네이버 로그인

| 항목 | 값 |
| --- | --- |
| 콘솔 | https://developers.naver.com/apps/#/register |
| 사용 API | **네이버 로그인** |
| 서비스 URL | `https://naezipnow.com` |
| Callback URL | `https://naezipnow.com/api/auth/callback/naver` |
| Vercel 환경변수 | `AUTH_NAVER_ID` = Client ID, `AUTH_NAVER_SECRET` = Client Secret |

### 1-3. 구글 로그인

| 항목 | 값 |
| --- | --- |
| 콘솔 | https://console.cloud.google.com/apis/credentials |
| 만들 것 | 사용자 인증 정보 → OAuth 클라이언트 ID → **웹 애플리케이션** |
| 승인된 자바스크립트 원본 | `https://naezipnow.com` |
| 승인된 리디렉션 URI | `https://naezipnow.com/api/auth/callback/google` |
| 사전 작업 | OAuth 동의 화면 구성(앱 이름·지원 이메일·개인정보처리방침 URL `https://naezipnow.com/privacy`) |
| Vercel 환경변수 | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |

**끝나면 확인하는 법** (제가 아니라 직접 보실 수 있습니다):
`https://naezipnow.com/api/auth/providers` 를 브라우저에서 열어 `kakao`·`naver`·`google`
이 목록에 뜨는지 보시면 됩니다. 뜨는 순간 로그인 화면에도 버튼이 자동으로 살아납니다.

---

## 2. 두 번째 — 이메일 발송 (Resend) · 30분, 무료 구간 있음

**지금 상태:** `email.resend: false` (운영 health 실측)

지금은 비밀번호 재설정 메일이 Supabase 내장 메일 서버로 나갑니다. 동작은 하지만
Supabase 기본 SMTP 는 발송량 제한이 빡빡해서, 사용자가 몰리면 조용히 누락됩니다.
그리고 다음 기능들이 **키가 없어서 아예 안 나갑니다**:

- 고객문의 답변 메일 (`/api/support`)
- 알림 아웃박스 이메일 채널 (`lib/notifications/outbox.ts`) — 주간 다이제스트,
  가격 알림, 임장모임 참석 리마인더의 메일 경로

절차:

1. https://resend.com 가입 → **Domains** → `naezipnow.com` 추가
2. Resend 가 보여주는 DNS 레코드(SPF·DKIM·(선택)DMARC)를 **Vercel → Domains →
   naezipnow.com → DNS Records** 에 그대로 추가
3. Resend 에서 도메인이 **Verified** 로 바뀔 때까지 대기 (보통 수 분~수 시간)
4. **API Keys** → 키 생성 → Vercel 환경변수 `RESEND_API_KEY` 에 입력
   (키는 `re_` 로 시작합니다. 이 접두사가 아니면 코드가 무시합니다.)

> 발신 주소는 코드에 `누구집 <noreply@nuguzip.com>` 로 고정돼 있습니다. 그래서
> **다른 도메인이 아니라 반드시 `naezipnow.com` 을 인증**하셔야 합니다.

---

## 3. 세 번째 — 웹 푸시 알림 (VAPID) · 10분, 무료

**지금 상태:** `push.vapid: false`

가격 알림·주간 다이제스트·재방문 리마인더의 **푸시 경로**가 전부 꺼져 있습니다.
관련 크론은 이미 배포돼 돌고 있고, 키만 없어서 발송 단계에서 멈춥니다.

이건 외부 가입이 필요 없습니다. 키 한 쌍을 직접 만드시면 됩니다:

```
# 저장소 루트에서
node scripts/generate-vapid-keys.mjs
```

출력된 두 값을 Vercel 환경변수에 넣으세요:
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

> 제가 대신 만들지 않는 이유는 하나뿐입니다 — **private key 는 만들어진 자리에서
> 바로 사용처로만 가야** 합니다. 대화 로그에 남으면 폐기하고 다시 만들어야 합니다.

---

## 4. 검색·유입 관련 (각 10~30분, 무료)

### 4-1. Bing 웹마스터 도구 등록

네이버·구글은 등록을 마치셨습니다. Bing 은 아직입니다.
https://www.bing.com/webmasters → **Google Search Console 에서 가져오기** 를 쓰면
소유권 확인 없이 몇 초면 끝납니다. 사이트맵 주소는 `https://naezipnow.com/sitemap.xml`
(색인 파일, 하위 10종 · 총 27,427 URL).

### 4-2. Search Console 데이터 연동 (`GSC_*`)

색인 상태·검색 유입을 화면에서 보려면 서비스 계정이 필요합니다.

1. https://console.cloud.google.com → IAM 및 관리자 → **서비스 계정 만들기**
2. 키 → **JSON 키 추가** → 파일 다운로드
3. Search Console → 설정 → **사용자 및 권한** → 서비스 계정 이메일을
   `...iam.gserviceaccount.com` 형태 그대로 **전체 권한**으로 추가
4. Vercel 환경변수 3개:
   - `GSC_SERVICE_ACCOUNT_EMAIL` — JSON 의 `client_email`
   - `GSC_SERVICE_ACCOUNT_PRIVATE_KEY` — JSON 의 `private_key` **통째로**
     (BEGIN PRIVATE KEY 라고 적힌 머리글 줄부터 마지막 줄까지, 줄바꿈 포함.
     머리글을 여기 문자 그대로 적으면 시크릿 스캐너가 잡으므로 말로 씀)
   - `GSC_SITE_URL` — `https://naezipnow.com`

### 4-3. CrUX API 키 (실사용자 성능 지표)

https://console.cloud.google.com → API 및 서비스 → **Chrome UX Report API 사용 설정**
→ 사용자 인증 정보 → **API 키** → Vercel `CRUX_API_KEY`.
이게 있으면 실제 방문자 기준 LCP·INP·CLS 를 화면에서 추적합니다.

### 4-4. `sameAs` — 공식 계정 주소

구조화 데이터에 공식 SNS·채널 주소를 넣으면 검색엔진이 같은 주체로 묶습니다.
운영 중인 계정 주소(인스타그램·유튜브·네이버 블로그·카카오톡 채널 등)를 알려주시면
제가 코드에 넣겠습니다. **없으면 넣지 않습니다** — 없는 계정을 적으면 그 자체가 오류입니다.

### 4-5. data.go.kr 활용사례 등록

공공데이터포털에서 받아 쓰는 API 들의 "활용사례" 에 누구집을 등록하면 백링크와
신뢰 신호가 생깁니다. 포털 로그인 계정으로만 가능합니다.

---

## 5. 데이터 소스 — 아직 안 켜진 것 (선택)

운영 probe 실측(2026-07-28 22:18 UTC): 라이브 서비스 9개, 전국 카탈로그 39종 중
라이브 14 · 부분 2 · 샘플 2.

> **2026-07-29 정정 — 이 표의 환경변수 이름 하나가 틀려 있었습니다.**
> 한국부동산원 항목이 `REB_SERVICE_KEY` 로 적혀 있었는데, 코드가 실제로 읽는
> 이름은 `REB_OPENAPI_KEY` 입니다(`lib/reb/client.ts`). 그 이름으로 넣으셨다면
> 키는 멀쩡한데 아무 데도 연결되지 않습니다. 아래 표가 고친 버전입니다.
> 같은 종류의 오류가 다시 생기지 않도록 `scripts/check-env-key-names.mjs` 게이트를
> 추가했습니다 — 카탈로그에 적힌 이름과 코드가 실제로 읽는 이름이 어긋나면
> 릴리스 점검이 실패합니다.

| 안 켜진 것 | 환경변수 | 발급처 | 켜지면 생기는 것 |
| --- | --- | --- | --- |
| KOSIS 인구·가구 | `KOSIS_API_KEY` | https://kosis.kr/openapi | 지역 페이지의 인구·세대수 추세 |
| 한국도로공사 혼잡빈도 | `EX_DATA_API_KEY` | https://www.data.go.kr/data/15045664/fileData.do | 출퇴근 동선·장거리 이동 분석 |
| 한국부동산원 주간동향 | `REB_OPENAPI_KEY` | https://www.reb.or.kr | 주간 시세 변동률 위젯 |
| 금융상품 금리 | `FINLIFE_API_KEY` | https://finlife.fss.or.kr | 주담대 실제 공시금리 기반 자금계획 |

**지금 넣어도 아무 일도 일어나지 않는 것 — `SCHOOLINFO_API_KEY`**
학교알리미는 카탈로그에 이름만 올라 있고, 그 API 를 실제로 부르는 코드(어댑터)가
아직 없습니다. 키를 정확히 넣으셔도 값은 비어 있습니다. 그래서 발급받으실 필요가
지금은 없고, 화면의 상태 배지도 이걸 "연동됨"으로 켜지 않도록 고쳤습니다
(`ADAPTER_READY.schools = false`). 어댑터를 만들 때 다시 안내드리겠습니다.

**혼잡빈도(`EX_DATA_API_KEY`)도 같은 상태입니다.** 지금 화면에 나오는 혼잡 구간은
저장소에 번들된 **공식 샘플 데이터**이고, 이전에는 그게 `mode: "live"` 로 표시되고
있었습니다 — 실측처럼 보였다는 뜻입니다. `mode: "sample"` 로 바로잡았습니다.

나머지는 전부 무료 신청이고, 승인까지 보통 즉시~1영업일입니다(추정 — 기관별로 다릅니다).
급하지 않습니다. **안 켜진 소스는 화면에서 "없는 것"으로 처리되지, 지어내지 않습니다.**

---

## 6. 결제 — Stripe (해외 결제용, 지금은 불필요)

**지금 상태:** `payment.toss: true`, `payment.stripe: false`

원화 결제는 토스페이먼츠로 **이미 살아 있습니다**. Stripe 는 해외 카드 결제를 받을 때만
필요합니다. 지금 단계에서는 **안 하셔도 됩니다.** 나중에 필요해지면
`STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `STRIPE_PRICE_*` 를 넣으시면 됩니다.

---

## 7. 돈이 나가는 결정 — 제가 판단하지 않습니다

### 7-1. Vercel 플랜

현재 **Hobby(무료)** 팀이고, 최근 "무료 티어 함수 호출 100만 회 100% 소진" 메일을
받으셨습니다. 사실만 정리하면:

- 무료 한도를 넘으면 초과분은 과금이 아니라 **제한**으로 이어집니다.
- Pro 는 월 $20/사용자(추정 — 가격은 Vercel 페이지에서 확인하세요).
- 제 쪽에서는 호출 수를 줄이는 방향(정적 렌더 유지, 불필요한 `force-dynamic` 제거)으로
  계속 작업하고 있습니다. 오늘 로그인 페이지도 일부러 정적으로 두었습니다.

**결정은 소유자 몫입니다. 저는 결제를 실행하지 않습니다.**

### 7-2. Supabase

Pro 로 이미 올리셨습니다($25/월). 추가 컴퓨트·애드온은 지금 필요하지 않다고 봅니다.

---

## 8. 개인정보 판단 — 임장 사진 공개 범위

임장노트 사진을 **공개 URL로 서빙할지, 서명 URL(Signed URL)로만 서빙할지** 정하셔야
합니다. 지금은 서명 URL 방식이고, 이대로도 정상 동작합니다.

- 공개 URL: CDN 캐시가 잘 먹어서 **빠르고 저렴**. 대신 주소를 아는 사람은 누구나 봅니다.
- 서명 URL: **주소가 새어도 만료**됨. 대신 캐시 효율이 떨어집니다.

임장 사진에는 집 내부·주소를 짐작할 수 있는 정보가 담깁니다. **제가 임의로 공개로
바꾸지 않습니다.** 어느 쪽으로 할지만 알려주시면 그대로 맞추겠습니다.

---

## 9. 아직 답을 못 받은 것 하나

**"Daily Real Estate Posts: All jobs have failed"** 메일 — 이 워크플로는
`kdw1203-art/nuguzip_new` 저장소에 **없습니다**(이 저장소의 워크플로는 backfill ·
deploy · e2e · etl · seo-routines · synthetic 6개). 다른 저장소의 것으로 보입니다.
어느 저장소인지 알려주시면 그쪽을 보겠습니다. 지금 이 사이트 운영에는 영향이 없습니다.

---

## 우선순위 요약

| 순위 | 할 일 | 시간 | 비용 | 안 하면 |
| --- | --- | --- | --- | --- |
| 1 | 카카오 로그인 등록 | 30분 | 무료 | 가입 경로가 이메일 하나뿐 |
| 2 | 네이버·구글 로그인 등록 | 각 20분 | 무료 | 위와 동일 |
| 3 | Resend 도메인 인증 + 키 | 30분 | 무료 구간 | 문의 답변·알림 메일 미발송 |
| 4 | VAPID 키 생성 | 10분 | 무료 | 푸시 알림 전부 미발송 |
| 5 | Bing 웹마스터 등록 | 10분 | 무료 | Bing 유입 없음 |
| 6 | GSC 서비스 계정 | 30분 | 무료 | 색인 상태를 화면에서 못 봄 |
| 7 | 데이터 소스 5종 신청 | 각 15분 | 무료 | 해당 지표가 화면에 안 나옴 |
| — | Vercel 플랜 · 사진 공개 범위 | — | — | **판단 필요(제가 결정하지 않음)** |

1~4번까지만 하시면 서비스가 "가입되고, 알림이 가고, 메일이 오는" 상태가 됩니다.
5번 이하는 유입·계측이라 급하지 않습니다.
