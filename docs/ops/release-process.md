# 릴리스 절차 (소유자용, v1 · 2026-09-02)

> 목적: **배포 한 번 = 커밋 한 번**. 지금까지는 zip 적용 → `vercel --prod`(CLI) →
> 커밋 → 푸시 순서라, 같은 코드가 두 번 배포됐고(CLI 1회 + GitHub Actions 1회)
> CLI 배포는 `gitDirty` 로 남아 "어느 커밋이 운영인가"를 알 수 없었다
> (Vercel 배포 목록 실측: 943·941·939 모두 2건씩).

## 원칙

1. 운영 배포는 **GitHub Actions 만** 한다 (`.github/workflows/deploy.yml`, main 푸시 트리거).
   로컬 `npx vercel --prod` 는 쓰지 않는다.
2. 로컬 `npm run build` 는 **게이트 검사용**이다(환경검사·리뷰동결·타입램프·단위테스트·
   번들 예산). 통과하지 못하면 커밋하지 않는다.
3. 되돌리기는 Vercel 대시보드 "Promote to Production"(이전 배포 승격)으로 한다 — 코드
   되돌리기(revert 커밋)는 그 다음이다.

## 순서 (PowerShell)

```
cd $HOME\nuguzip_new
git pull --rebase origin main
tar -xf $HOME\Downloads\nuguzipNNN.zip      # 세션이 준 누적 zip
npm.cmd run build                           # 게이트 전부 통과해야 다음으로
git add -A
git commit -m "NNN: <세션이 준 한 줄 요약>"
git push
```

푸시 뒤 5~12분 안에 Actions 가 빌드·배포·스모크까지 한다. 확인은 둘 중 하나:
- GitHub → Actions 탭 → 최신 실행이 초록
- 사이트에서 변경 신호 확인(세션이 커밋 메시지에 적어 준 문구·경로)

## 하지 말 것

- `vercel --prod` 를 먼저 돌리기 — 중복 배포 + gitDirty.
- 게이트 실패를 `--no-verify`·환경변수로 우회하기 — 게이트는 심사 동결·법적 표기까지 지킨다.
- 시크릿을 커밋에 넣기 — `.env.local` 은 무시 목록에 있고, 값은 Vercel 대시보드에만 둔다
  (docs/ops/secrets-policy.md).

## 배포 후 5분

- 홈·단지 하나·지도 열어 보기(모바일 1·데스크톱 1).
- Vercel → Logs 에서 `error` 필터 1분 훑기.
- 다음 예약 점검(세션)이 pgss·런타임 로그로 효과를 재측정한다.
