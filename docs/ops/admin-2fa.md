# 운영자 계정 2FA (오너 작업)

코드베이스에 TOTP/AAL2 강제 미들웨어는 아직 없다. **계정 측 MFA 등록**이 선행이다.

## 권장 경로 (Supabase Auth 사용 시)

1. Supabase Dashboard → Authentication → Providers / MFA  
2. 스태프 이메일(`lib/auth/admin-emails.ts` allowlist)에 MFA 등록  
3. 로그인 후 Authenticator 앱으로 2차 인증 확인  
4. 완료 후 checklist `admin-2fa` → `done`

## NextAuth(Google) 스태프

- Google 계정 자체에 2SV(2단계 인증) 강제  
- Workspace라면 관리자 정책으로 2SV 필수

## 후속(코드, 별도 BUILD)

- 세션에 `aal2`/MFA claim 이 있을 때만 `/admin/*` 허용하는 미들웨어  
- 미등록 스태프는 `/admin` 진입 시 설정 안내

이 항목은 오너 등록 완료 전까지 `todo`/`blocked` 유지.

## 완료 기록

| 일시 | 담당 | 스태프 이메일 | 방법(Supabase MFA / Google 2SV) | 결과 |
|------|------|---------------|--------------------------------|------|
| _TBD_ | | | | |

완료 후 `lib/open-beta/checklist.ts` → `admin-2fa` = `done`.
