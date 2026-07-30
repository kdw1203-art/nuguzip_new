# 장애 공지 템플릿 · 운영 핫라인

## 공지 초안 (커뮤니티 · 배너 · X)

```
[장애 안내] YYYY-MM-DD HH:MM KST
영향: (로그인 / 임장노트 저장 / AI 정리 / 지도 / 결제 중 해당)
증상: …
원인: 조사 중 | …
조치: …
다음 안내: HH:MM 경에 재공지합니다.
문의: /support
```

## 내부 체크

1. Vercel Deployments — 최근 prod READY / Error
2. Supabase Status — Auth / DB / Storage
3. `/admin/ops` — 퍼널·에러 급증 여부
4. `AUTH_URL` / OAuth / Toss 웹훅 최근 실패 로그

## 핫라인 (오너 기입)

- 온콜: ________________
- Toss 결제 이슈: ________________
- 도메인/DNS: ________________
