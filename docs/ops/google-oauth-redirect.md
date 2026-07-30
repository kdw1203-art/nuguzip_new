# Google OAuth `redirect_uri_mismatch` 해결

에러 화면: **400 오류: redirect_uri_mismatch**  
원인: 앱이 Google에 보내는 `redirect_uri`가 Cloud Console의 **승인된 리디렉션 URI**와 문자 단위로 불일치.

## 앱이 보내는 값 (실측)

프로덕션 NextAuth (`nuguzip_new`) 기준:

| Origin | `redirect_uri` |
|--------|----------------|
| `https://nuguzip.com` | `https://nuguzip.com/api/auth/callback/google` |
| `https://www.nuguzip.com` | `https://www.nuguzip.com/api/auth/callback/google` |
| 로컬 | `http://localhost:3000/api/auth/callback/google` |

Client ID는 Vercel `AUTH_GOOGLE_ID` (접두 `217437276160…`)와 동일해야 합니다.

> 이 URI는 Supabase `…/auth/v1/callback` 이 **아닙니다**. 예전 홈페이지(Supabase OAuth)용 URI만 등록돼 있으면 mismatch가 납니다.

## Google Cloud Console 작업 (필수)

1. [Google Cloud Console → API 및 서비스 → 사용자 인증 정보](https://console.cloud.google.com/apis/credentials)
2. `AUTH_GOOGLE_ID`에 해당하는 **OAuth 2.0 클라이언트 ID** (웹 애플리케이션) 열기
3. **승인된 리디렉션 URI**에 아래를 **한 줄씩** 추가 후 저장  
   - `https://nuguzip.com/api/auth/callback/google`  
   - `https://www.nuguzip.com/api/auth/callback/google`  
   - (개발) `http://localhost:3000/api/auth/callback/google`
4. **승인된 JavaScript 원본** (필요 시)  
   - `https://nuguzip.com`  
   - `https://www.nuguzip.com`  
   - `http://localhost:3000`
5. 저장 후 1–5분 뒤 `/login`에서 Google 로그인 재시도

## Vercel 환경변수 확인

| 키 | 권장 값 |
|----|---------|
| `AUTH_GOOGLE_ID` | Console 웹 클라이언트 ID |
| `AUTH_GOOGLE_SECRET` | 해당 클라이언트 시크릿 |
| `AUTH_URL` | `https://nuguzip.com` (끝 슬래시 없음) |
| `AUTH_SECRET` | 설정됨 |

`AUTH_URL`이 preview URL·잘못된 path면 콜백이 어긋날 수 있습니다. 프로덕션은 apex를 쓰세요.

## 검증

```bash
# 로컬에서 프로덕션이 보내는 redirect_uri 확인
node scripts/probe-google-oauth-redirect.mjs
```

기대: `"redirectUri": "https://nuguzip.com/api/auth/callback/google"`

그다음 브라우저에서 Google 로그인 → 계정 선택 → `/login` 또는 콜백 후 세션 유지.
