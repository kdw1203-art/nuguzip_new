# auth-bridge (`my-project`)

Supabase Auth **Site URL** 이 옛 호스트
`https://my-project-kdw1203-arts-projects.vercel.app` 로 남아 있을 때,
이메일 인증 링크가 404 나지 않도록 `https://nuguzip.com/auth/confirm` 으로 넘기는
정적 브릿지입니다.

## 배포

```bash
cd auth-bridge
npx vercel link --yes --scope kdw1203-arts-projects --project my-project
npx vercel --prod --yes --scope kdw1203-arts-projects
npx vercel alias set <deployment-url> my-project-kdw1203-arts-projects.vercel.app --scope kdw1203-arts-projects
npx vercel project protection disable my-project --sso --scope kdw1203-arts-projects
```

## 근본 해결

Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://nuguzip.com`
- Redirect URLs: `https://nuguzip.com/auth/confirm`, `https://nuguzip.com/auth/callback`, `https://nuguzip.com/**`
