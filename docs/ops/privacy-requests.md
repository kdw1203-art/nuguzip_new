# SOP — 개인정보 요청 처리 (열람·정정·삭제·탈퇴) v1 · 2026-09-02

> 근거: 개인정보처리방침(/legal/privacy) — "회원 탈퇴 시 즉시 삭제(법령 보존 기간 적용)",
> 설정 화면 안내 — "탈퇴는 이메일로 처리 · 노트는 30일 보관 후 삭제".
> 채널: nuguzip@naver.com (고객 SOP 와 같은 인박스).

## 기한

| 요청 | 1차 응답 | 완료 |
|---|---|---|
| 열람(내 정보 사본) | 24시간 | 10일 이내 |
| 정정 | 24시간 | 3영업일 |
| 삭제·탈퇴 | 24시간 | 접수 즉시 계정 비활성 → 30일 뒤 파기(노트 복구 유예) |
| 마케팅 수신 철회 | — | 즉시(설정 화면에서 본인이 끄는 것이 원칙) |

## 본인 확인

1. **가입 이메일에서 보낸 요청만** 처리한다. 다른 주소면 "가입 이메일로 다시 보내 달라"고 답한다.
2. 소셜 가입자는 로그인 상태 스크린샷(설정 화면의 이메일 노출)으로 갈음할 수 있다.
3. 확인 전에는 어떤 정보도 변경·제공하지 않는다(고객 SOP 3항과 동일).

## 앱 안 회원탈퇴 (965)

설정 › 계정 › **회원탈퇴** 가 열렸다(`POST /api/me/delete-account`, '탈퇴' 직접 입력).
접수되면 코드가 SOP 1·2 항을 **즉시** 수행한다:

- `account_deletion_requests` 에 행 생성(`purge_after` = 접수 + 30일).
- `app_users.is_banned = true, ban_reason = 'account_deletion_requested'` → 로그인
  차단(965부터 로그인·세션 갱신이 `is_banned` 를 실제로 본다).
- 임장노트 `is_public=false`, 매물 `is_hidden=true` (게시글·질문은 SOP 2 항대로 수동).
- 접수 회신 메일(Resend 설정 시) — 파기 예정일·취소 방법(가입 메일로 고객센터).
- 자동결제(`billing_subscriptions.active`)가 있으면 접수를 거절하고 먼저 해지하게 한다.

운영자가 할 일: 매일 5분 점검에서 아래를 보고, `purge_after` 가 지난 행은 SOP 4·5 항대로
파기한 뒤 `purged_at` 을 적는다. 취소 요청(가입 메일 확인)은 `cancelled_at` 을 적고
`app_users.is_banned=false, ban_reason=null` 로 되돌린다.

```sql
select user_email, requested_at, purge_after, cancelled_at, purged_at
  from public.account_deletion_requests
 where purged_at is null
 order by purge_after;
```

## 삭제·탈퇴 절차 (AGENT 세션에 위임 가능)

1. 접수 회신: "접수했고 30일 뒤 파기됩니다. 그 사이 취소하려면 같은 메일로 알려 주세요."
2. 즉시: 로그인 차단(플랜 해지·세션 무효화)과 공개 콘텐츠 비공개 전환
   (임장노트 `is_public=false`, 게시글·질문·매물 숨김).
3. 유료 구독이 살아 있으면 먼저 해지(환불 여부는 sop-refunds.md 기준).
4. 30일 뒤: 개인 식별 컬럼을 가진 표를 전부 파기. 표 목록은 추측하지 말고 아래 조회로
   **그때그때** 뽑는다(표가 늘어난다):
   ```sql
   select table_schema, table_name, column_name
   from information_schema.columns
   where table_schema in ('public')
     and (column_name in ('email','author_email','user_email','user_id','author_id','viewer_email')
          or column_name ilike '%email%')
   order by 1,2,3;
   ```
5. 법령 보존 대상은 남긴다(전자상거래법: 결제·환불 기록 5년, 소비자 불만·분쟁 3년,
   접속기록 3개월). 남기는 행은 이메일을 `deleted-<id>@removed.invalid` 로 가명화한다.
6. 완료 회신: 무엇을 지웠고 무엇을 법령상 남겼는지 한 줄씩.
7. 기록: 주간 브리핑 지표에 "개인정보 요청 N건·평균 처리일" 편입.

## 열람 요청

- 위 조회로 뽑은 표에서 해당 이메일 행을 JSON 으로 내보내 **암호 걸린 zip** 으로 회신.
- 다른 사람 정보가 섞이는 열(댓글 상대 등)은 제거한다.

## 하지 말 것

- 대화창(채팅·세션)에 요청자 이메일과 함께 노트 본문·결제 정보를 붙여 넣기.
- 확인 없이 "삭제했습니다" 회신 — 실제 파기일에 회신한다.
