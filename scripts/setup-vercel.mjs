#!/usr/bin/env node
/**
 * nuguzip.com Vercel 환경변수 대화형 설정 스크립트
 * 실행: node scripts/setup-vercel.mjs
 * 사전 요구: vercel CLI 로그인 상태 (vercel login)
 */

import { execSync } from "child_process";
import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

function addEnv(key, value, env = "production") {
  if (!value?.trim()) {
    console.log(`  ⏭  ${key} 건너뜀 (빈 값)`);
    return;
  }
  try {
    execSync(`echo "${value}" | vercel env add ${key} ${env}`, { stdio: "pipe" });
    console.log(`  ✅ ${key} 등록 완료`);
  } catch {
    console.log(`  ⚠️  ${key} 등록 실패 — 대시보드에서 수동으로 추가하세요`);
  }
}

async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  nuguzip.com Vercel 환경변수 설정 도우미");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // 1. 필수 인증
  console.log("[ 1단계 ] 필수 인증 설정\n");
  const authSecret = await ask(
    "AUTH_SECRET (비워두면 자동 생성): "
  );
  const secret = authSecret.trim() || generateSecret();
  addEnv("AUTH_SECRET", secret);
  console.log(`  → AUTH_SECRET 값: ${secret.slice(0, 8)}… (복사해두세요)\n`);

  addEnv("AUTH_URL", "https://nuguzip.com");
  console.log("  → AUTH_URL=https://nuguzip.com 등록됨\n");

  // 2. Supabase
  console.log("[ 2단계 ] Supabase 설정 (이메일 로그인)\n");
  const sbUrl = await ask("NEXT_PUBLIC_SUPABASE_URL (엔터 = 기존값 유지): ");
  const sbAnon = await ask("NEXT_PUBLIC_SUPABASE_ANON_KEY: ");
  const sbService = await ask("SUPABASE_SERVICE_ROLE_KEY: ");
  addEnv("NEXT_PUBLIC_SUPABASE_URL", sbUrl || "https://pbhiskvwpwwhtkmnhkbm.supabase.co");
  addEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", sbAnon);
  addEnv("SUPABASE_SERVICE_ROLE_KEY", sbService);

  // 3. 네이버/Google OAuth (선택)
  console.log("\n[ 3단계 ] OAuth 소셜 로그인 (선택, 엔터로 건너뜀)\n");
  const naverId = await ask("AUTH_NAVER_ID: ");
  const naverSecret = await ask("AUTH_NAVER_SECRET: ");
  addEnv("AUTH_NAVER_ID", naverId);
  addEnv("AUTH_NAVER_SECRET", naverSecret);

  const googleId = await ask("AUTH_GOOGLE_ID: ");
  const googleSecret = await ask("AUTH_GOOGLE_SECRET: ");
  addEnv("AUTH_GOOGLE_ID", googleId);
  addEnv("AUTH_GOOGLE_SECRET", googleSecret);

  // 4. OpenAI
  console.log("\n[ 4단계 ] AI 기능 (선택)\n");
  const openai = await ask("OPENAI_API_KEY: ");
  addEnv("OPENAI_API_KEY", openai);
  addEnv("OPENAI_MODEL", "gpt-4o-mini");

  // 5. 임시 토큰 (선택)
  console.log("\n[ 5단계 ] 임시 관리자 토큰 (선택)\n");
  const emergency = await ask("EMERGENCY_ACCESS_TOKEN (빈 값이면 미사용): ");
  addEnv("EMERGENCY_ACCESS_TOKEN", emergency);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  설정 완료! Vercel 재배포를 실행하세요:");
  console.log("  vercel --prod");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  rl.close();
}

function generateSecret() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 44 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

main().catch((e) => {
  console.error(e);
  rl.close();
  process.exit(1);
});
