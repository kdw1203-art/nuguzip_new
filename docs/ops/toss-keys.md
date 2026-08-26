# 토스페이먼츠 키 배치

## 상점에 키 세트가 셋 있다

콘솔 화면에서는 셋 다 `live_…` 로 똑같이 생겼지만, 서로 바꿔 쓰면 안 된다.

| 섹션 | 상점아이디(MID) | 클라이언트 키 | 쓰는 곳 |
| --- | --- | --- | --- |
| 주문서형·결제창형 연동 키 | (MID 무관·공용) | `live_gck_…` | 결제위젯 SDK `widgets()` |
| API 개별 연동 키 | `nuguzibowg` | `live_ck_…` | 결제창 SDK `payment()` |
| API 개별 연동 키 | `bill_nuguzevk8` | `live_ck_…` | **자동결제(빌링)** 카드 등록·승인 |

토스 문서(`reference/using-api/api-keys`)가 못 박아 둔 것:

- "클라이언트 키와 시크릿 키는 항상 **'세트'** 로 묶여 있고, 한 세트로 써야 돼요."
- "자동결제(빌링) … **서비스마다 다른 상점아이디(MID)** 에 각각 API 개별 연동 키가 발급돼요."
- "각 서비스에 맞는 연동 키를 사용하세요. 예를 들어, 브랜드페이 MID로 발급된
  클라이언트 키로 결제창 SDK를 초기화하면 **오류가 납니다**."

## Vercel 환경변수

| 변수 | 값 | 비고 |
| --- | --- | --- |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 일반결제로 쓸 섹션의 클라이언트 키 | 공개 값(브라우저 번들에 실린다) |
| `TOSS_SECRET_KEY` | **같은 섹션**의 시크릿 키 | 서버 전용 |
| `NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY` | `bill_…` MID 의 클라이언트 키 | 공개 값 |
| `TOSS_BILLING_SECRET_KEY` | `bill_…` MID 의 시크릿 키 | 서버 전용 |
| `NEXT_PUBLIC_TOSS_BILLING_ENABLED` | 빌링 전자계약 승인 후에만 `1` | 미설정이면 자동결제 화면이 열리지 않는다 |

빌링 키 두 개가 없으면 일반결제 키로 **폴백**한다. MID 를 하나만 쓰는 상점에서는
그게 정답이지만, 지금처럼 MID 가 나뉜 상점에서는 그 폴백이 곧 카드 등록 실패다.

## 코드가 대신 확인해 주는 것

`lib/payments/toss-keys.ts` 가 접두사로 종류(`gck`/`ck`)와 환경(`test`/`live`)을
읽어 **짝이 맞는지** 판정한다. `/admin/payments` 에 두 줄로 나온다.

- 종류 불일치 — 위젯 클라이언트 키(`gck`) + API 시크릿(`sk`) 같은 조합.
  결제창은 뜨는데 승인에서 깨진다. 사용자에게는 "결제가 되다 말았다" 로 보이는,
  가장 나쁜 실패 모양이라 따로 잡는다.
- 환경 불일치 — `live` 클라이언트 + `test` 시크릿.
- 자동결제 클라이언트 키가 `gck` 인 경우 — 카드 등록창은 결제창 SDK 라
  `ck` 가 필요하다. `isTossBillingEnabled()` 가 false 를 돌려 화면이 열리지 않는다.

`gck` 는 문자열 끝이 `ck` 와 겹쳐서, 접두사를 짧은 것부터 보면 API 키로 오인된다.
긴 접두사부터 보도록 해 두고 유닛 테스트(`tests/unit/toss-keys.test.ts`)로 고정했다.

## 시크릿 키를 다루는 원칙

시크릿 키는 **Vercel 대시보드에 직접 입력한다.** 채팅·이슈·커밋 어디에도 남기지
않는다. 클라이언트 키는 브라우저 번들에 실리는 공개 값이라 공유해도 무방하다 —
둘의 성격이 다르다는 점이 이 문서에서 가장 중요한 한 줄이다.

## 자동결제를 열기 전에 — 순서가 중요하다

두 MID 모두 전자결제 계약 완료(2026-08-26). 이제 열 수 있지만 **순서를 지켜야**
한다. 마지막 스위치를 먼저 켜면 첫 달만 청구되고 둘째 달부터 조용히 끊긴다.

1. `NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY` · `TOSS_BILLING_SECRET_KEY` (자동결제 MID 세트)
2. **Supabase vault 에 `cron_secret` 등록** — Vercel 의 `CRON_SECRET` 과 같은 값
3. `NEXT_PUBLIC_TOSS_BILLING_ENABLED=1`

### 2번이 왜 따로 적혀 있나

`ops.run_billing_renewals()` 는 vault 의 `cron_secret` 으로 `/api/cron/billing-renewals`
를 호출한다. 시크릿이 없으면 예전에는 이렇게 끝났다:

```sql
if s is null then
  return;   -- 조용히 종료
end if;
```

2026-08-26 실측: vault 에 등록된 시크릿은 `toss_secret_key` 하나뿐이고
`cron_secret` 은 **없다.** 그 결과 `cron.job_run_details` 에는
**25회 실행 · 25회 succeeded** 로 남았다(마지막 08-26 10:10 KST). 8월 13일 배선
이후 갱신은 한 번도 돌지 않았는데 기록은 계속 성공이었다.

`ops.cron_job_failure_check` 는 `status <> 'succeeded'` 만 보므로 이 잡을
영원히 못 잡는다. **아무 일도 안 하면서 성공을 보고하는 잡은, 실패하는 잡보다
나쁘다.** 그래서 `return` 을 `raise exception` 으로 바꿨다 — 이제 시크릿이 없으면
크론이 실패하고, 기존 경보 배선(매시 `cron_job_failure_check` → critical →
`/admin/ops`)이 그대로 잡는다. 같은 패턴을 쓰던 `run_social_autopost`,
`run_social_upload_drain` 도 함께 고쳤다.
