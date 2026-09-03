# 릴리스 절차 (소유자용, v2 · 2026-09-02)

> 목적: **배포 한 번 = 커밋 한 번**. 지금까지는 zip 적용 → `vercel --prod`(CLI) →
> 커밋 → 푸시 순서라, 같은 코드가 두 번 배포됐고(CLI 1회 + GitHub Actions 1회)
> CLI 배포는 `gitDirty` 로 남아 "어느 커밋이 운영인가"를 알 수 없었다
> (Vercel 배포 목록 실측: 943·941·939 모두 2건씩).

> **v2 정정(2026-09-02 저녁)**: v1 은 "Actions 만 배포한다"고 적었지만, 실측 결과
> **Actions 는 944(9/1) 이후 배포를 한 번도 만들지 못했다.** 원인은 945 에서 추가한
> 가이드 9쪽의 빵부스러기(BreadcrumbList) 마지막 항목에 URL 이 비어 `check-jsonld`
> 게이트가 실패한 것(+ 분석 페이지의 `▾` 캐럿이 `check-dead-controls` 에 걸림).
> 둘 다 이 게이트는 **CI 에서만 돌고 로컬 `npm run build` 에는 없어서** 로컬은 초록,
> CI 는 빨강이었고 950·951 은 푸시됐지만 운영에 오르지 못했다. 952 에서 둘 다 고쳤다.
> 그래서 절차를 "Actions 초록 확인 → 아니면 CLI 로 즉시 배포"로 바꾼다.

## 원칙

1. 운영 배포의 **정본은 GitHub Actions** 다 (`.github/workflows/deploy.yml`, main 푸시 트리거).
2. 단, **Actions 가 실패했거나 12분 안에 초록이 안 되면** `npx.cmd vercel --prod` 로
   즉시 배포한다. 코드가 운영에 안 오르는 것이 중복 배포보다 훨씬 나쁘다.
3. 로컬 `npm run build` 는 **게이트 검사용**이다(환경검사·리뷰동결·타입램프·단위테스트·
   번들 예산). 통과하지 못하면 커밋하지 않는다. 952 부터 CI 게이트 중 소스·산출물만
   보는 6개(dead-controls·route-links·icon-names·contrast-tokens·jsonld·cache-policy,
   합쳐 2초)를 로컬 `npm run build` 에도 넣었다 — "로컬 초록·CI 빨강"이 다시 생기지
   않게. 로컬에 여전히 없는 것은 gitleaks·시크릿 표식·마이그레이션 grant·소스 뷰
   권한·링크 크롤(서버 기동 필요)뿐이다.
4. 되돌리기는 Vercel 대시보드 "Promote to Production"(이전 배포 승격)으로 한다 — 코드
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

푸시 뒤 5~12분 안에 Actions 가 빌드·배포·스모크까지 한다. 확인:
- GitHub → Actions 탭 → 최신 실행이 초록 → 끝.
- **빨강이거나 12분이 지나도 안 끝나면** → 아래 한 줄로 직접 배포하고, 실패한 스텝
  이름을 다음 세션에 알려 준다(스텝 이름만 있으면 고칠 수 있다).

```
npx.cmd vercel --prod
```

## 하지 말 것

- Actions 결과를 보기도 전에 `vercel --prod` 를 먼저 돌리기 — 중복 배포 + gitDirty.
  (Actions 가 빨강일 때 돌리는 것은 "하지 말 것"이 아니라 "해야 할 것"이다.)
- 게이트 실패를 `--no-verify`·환경변수로 우회하기 — 게이트는 심사 동결·법적 표기까지 지킨다.
- 시크릿을 커밋에 넣기 — `.env.local` 은 무시 목록에 있고, 값은 Vercel 대시보드에만 둔다
  (docs/ops/secrets-policy.md).

## 배포 후 5분

- 홈·단지 하나·지도 열어 보기(모바일 1·데스크톱 1).
- Vercel → Logs 에서 `error` 필터 1분 훑기.
- 다음 예약 점검(세션)이 pgss·런타임 로그로 효과를 재측정한다.

## 부록 — "푸시했는데 운영이 안 바뀐다" 진단 순서

1. Vercel → Deployments: 최신 Production 배포의 커밋 SHA 가 내 푸시와 같은가.
   다르면 Actions 가 배포를 못 만든 것이다.
2. GitHub → Actions → 최신 실행 → 빨간 스텝 이름을 읽는다. 스텝 이름이 곧 원인이다
   (`Structured data (JSON-LD) check` = 구조화 데이터, `Dead control check` = 장식용
   컨트롤, `Link integrity check` = 끊긴 링크, `Cache policy check` = 캐시 정책 …).
3. 우선 `npx.cmd vercel --prod` 로 운영을 살리고, 스텝 이름을 세션에 전달한다.
