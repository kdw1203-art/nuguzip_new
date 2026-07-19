#!/usr/bin/env node
/**
 * VAPID 키 자동 생성 스크립트
 * 사용법: node scripts/generate-vapid-keys.mjs
 *
 * - 새 VAPID 키 쌍을 생성하고 .env.local 에 자동으로 추가합니다.
 * - 이미 키가 설정돼 있으면 덮어쓰지 않습니다 (--force 플래그로 덮어쓰기 가능).
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");

const require = createRequire(import.meta.url);
const webpush = require("web-push");

const args = process.argv.slice(2);
const force = args.includes("--force");

// ── 기존 .env.local 읽기 ──────────────────────────────────────
let envContent = "";
if (fs.existsSync(ENV_PATH)) {
  envContent = fs.readFileSync(ENV_PATH, "utf-8");
}

// 이미 공개키가 설정돼 있으면 중단
const alreadySet =
  envContent.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY=") &&
  envContent
    .split("\n")
    .find((l) => l.startsWith("NEXT_PUBLIC_VAPID_PUBLIC_KEY="))
    ?.split("=")[1]
    ?.trim();

if (alreadySet && !force) {
  console.log("✅  VAPID 키가 이미 .env.local 에 설정돼 있습니다.");
  console.log("    덮어쓰려면: node scripts/generate-vapid-keys.mjs --force");
  process.exit(0);
}

// ── 새 키 생성 ────────────────────────────────────────────────
const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("\n🔑  새 VAPID 키 생성 완료:");
console.log(`    Public  : ${publicKey}`);
console.log(`    Private : ${privateKey.slice(0, 8)}${"*".repeat(privateKey.length - 8)}`);

// ── .env.local 업데이트 ──────────────────────────────────────
function setEnvVar(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  }
  return content + `\n${key}=${value}`;
}

let updated = envContent;
updated = setEnvVar(updated, "NEXT_PUBLIC_VAPID_PUBLIC_KEY", publicKey);
updated = setEnvVar(updated, "VAPID_PRIVATE_KEY", privateKey);
updated = setEnvVar(updated, "VAPID_SUBJECT", "mailto:admin@woodong.kr");

// 파일 앞에 빈 줄이 없으면 추가
if (updated && !updated.startsWith("\n") && !updated.startsWith("#")) {
  updated = updated.trimStart();
}

fs.writeFileSync(ENV_PATH, updated.trimStart(), "utf-8");

console.log(`\n✅  .env.local 에 VAPID 키가 저장됐습니다: ${ENV_PATH}`);
console.log("\n📋  다음 단계:");
console.log("    1. Supabase 대시보드에서 017_push_subscriptions.sql 마이그레이션 실행");
console.log("    2. npm run dev 재시작");
console.log("    3. 브라우저에서 알림 허용 → /api/push/subscribe POST 확인");
console.log("    4. 배포 시 Vercel 환경변수에도 동일하게 추가\n");
