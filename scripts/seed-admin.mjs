/**
 * Supabase app_users에 관리자 행을 넣거나 갱신합니다.
 *
 * 비밀번호 전달 (택1):
 *   - SEED_ADMIN_PASSWORD 환경변수
 *   - my-app/.seed-admin-password.txt 한 줄 (성공 시만 파일 삭제, Git 무시됨)
 *   - SEED_ADMIN_PASSWORD_FILE=절대/상대 경로
 *
 * 사용: my-app 또는 워크스페이스 루트에서
 *   npm run seed:admin
 * 선택: SEED_ADMIN_EMAIL, SEED_ADMIN_NAME
 */
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { dirname, isAbsolute, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const workspaceRoot = join(appRoot, "..");

function loadEnvFile(absPath) {
  if (!existsSync(absPath)) return;
  const raw = readFileSync(absPath, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvFile(join(appRoot, ".env.local"));
loadEnvFile(join(appRoot, ".env"));
loadEnvFile(join(workspaceRoot, ".env.local"));
loadEnvFile(join(workspaceRoot, ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = String(
  process.env.SEED_ADMIN_EMAIL || "kdw1203@gmail.com",
)
  .trim()
  .toLowerCase();
const name = String(process.env.SEED_ADMIN_NAME || "관리자").trim();

const defaultPwFile = join(appRoot, ".seed-admin-password.txt");
const envPwFile = process.env.SEED_ADMIN_PASSWORD_FILE?.trim();
const pwFilePath = envPwFile
  ? isAbsolute(envPwFile)
    ? envPwFile
    : join(appRoot, envPwFile)
  : defaultPwFile;

let password = String(process.env.SEED_ADMIN_PASSWORD ?? "").trim();
let removePwFileAfterSuccess = false;

if (password.length < 8 && existsSync(pwFilePath)) {
  password = readFileSync(pwFilePath, "utf8").trim();
  removePwFileAfterSuccess = true;
}

if (!url || !key) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.",
  );
  console.error(
    "my-app/.env.local 또는 워크스페이스 루트 .env.local 에 넣은 뒤 다시 실행하세요.",
  );
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error(
    "비밀번호: SEED_ADMIN_PASSWORD 환경변수, 또는 my-app/.seed-admin-password.txt (한 줄, 8자 이상).",
  );
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: existing, error: selErr } = await sb
  .from("app_users")
  .select("id")
  .eq("email", email)
  .maybeSingle();

if (selErr) {
  console.error(selErr.message);
  process.exit(1);
}

if (existing?.id) {
  const { error } = await sb
    .from("app_users")
    .update({
      password_hash: hash,
      role: "admin",
      name: name || "관리자",
    })
    .eq("email", email);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log("업데이트됨: 관리자 역할 + 비밀번호 갱신", email);
} else {
  const { error } = await sb.from("app_users").insert({
    email,
    password_hash: hash,
    name: name || "관리자",
    role: "admin",
  });
  if (error) {
    console.error(error.message);
    console.error(
      "app_users 에 role 컬럼이 없다면 supabase/migrations/002_app_users_role.sql 을 실행하세요.",
    );
    process.exit(1);
  }
  console.log("생성됨: 관리자 계정", email);
}

if (removePwFileAfterSuccess && existsSync(pwFilePath)) {
  try {
    unlinkSync(pwFilePath);
    console.log("(로컬) 비밀번호 파일을 삭제했습니다:", pwFilePath);
  } catch {
    console.error("비밀번호 파일 삭제 실패 — 수동으로 지우세요:", pwFilePath);
  }
}
