#!/usr/bin/env node
/**
 * [레거시] 이전 nuguzip → nuguzip-homepage 이중 프로젝트 env 동기화 스크립트.
 * 2026-06-22 통합 후 단일 프로젝트(nuguzip-homepage)만 사용 — npm script에서 제거됨.
 * 필요 시 VERCEL_ENV_SOURCE / VERCEL_ENV_TARGET 로 다른 프로젝트 간 복제에 재활용 가능.
 *
 * 값 소스 (우선순위):
 *   1. `.env.vercel.production` / `.env.vercel.prod` / `.env.local` (my-app, gitignored)
 *   2. `vercel env pull` (production — sensitive 값은 빈 문자열일 수 있음)
 *
 * 장기 권장: Vercel 팀 **Shared Environment Variables**에 nuguzip·nuguzip-homepage 동시 연결
 * @see my-app/VERCEL_SETUP.md
 *
 * 사용:
 *   npm run sync:vercel-homepage-env
 *   node scripts/sync-vercel-env-homepage.mjs --dry-run
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE = process.env.VERCEL_SCOPE?.trim() || "kdw1203-arts-projects";
const SOURCE_PROJECT = process.env.VERCEL_ENV_SOURCE?.trim() || "nuguzip";
const TARGET_PROJECT = process.env.VERCEL_ENV_TARGET?.trim() || "nuguzip-homepage";
const ENVIRONMENT = process.env.VERCEL_ENV_TARGET_ENV?.trim() || "production";
const PULL_BASENAME = ".env.vercel-sync-source";
const PULL_FILE = resolve(ROOT, PULL_BASENAME);

/** 로컬 값 후보 (앞일수록 우선 — 나중 파일이 덮어씀) */
const LOCAL_VALUE_FILES = [
  ".env.local",
  ".env.vercel.prod",
  ".env.vercel.production",
];

const SKIP_PREFIXES = ["VERCEL_", "TURBO_", "NX_"];
const SKIP_KEYS = new Set(["VERCEL", "VERCEL_URL"]);

const EXTRA_FOR_TARGET = {
  AUTH_URL: "https://nuguzip.com",
};

const dryRun = process.argv.includes("--dry-run");

function run(cmd, opts = {}) {
  execSync(cmd, {
    cwd: ROOT,
    stdio: opts.silent ? "pipe" : "inherit",
    encoding: "utf8",
    ...opts,
  });
}

function linkProject(name) {
  run(`npx --yes vercel link --yes --scope ${SCOPE} --project ${name}`, {
    silent: true,
  });
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value !== "") out[key] = value;
  }
  return out;
}

function mergeLocalValues() {
  const merged = {};
  for (const file of [...LOCAL_VALUE_FILES].reverse()) {
    Object.assign(merged, parseEnvFile(resolve(ROOT, file)));
  }
  return merged;
}

function shouldSkip(key) {
  if (SKIP_KEYS.has(key)) return true;
  return SKIP_PREFIXES.some((p) => key.startsWith(p));
}

function listProjectKeys(projectName) {
  linkProject(projectName);
  const out = execSync(
    `npx --yes vercel env ls ${ENVIRONMENT} --scope ${SCOPE}`,
    { cwd: ROOT, encoding: "utf8" },
  );
  const keys = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s+([A-Z0-9_]+)\s+/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

function pullSourceValues() {
  linkProject(SOURCE_PROJECT);
  if (existsSync(PULL_FILE)) unlinkSync(PULL_FILE);
  try {
    run(
      `npx --yes vercel env pull ${PULL_BASENAME} --environment ${ENVIRONMENT} --yes --scope ${SCOPE}`,
      { silent: true },
    );
  } catch {
    return {};
  }
  const pulled = parseEnvFile(PULL_FILE);
  if (existsSync(PULL_FILE)) unlinkSync(PULL_FILE);
  return pulled;
}

function addEnv(key, value) {
  if (dryRun) {
    console.log(`  [dry-run] would set ${key}`);
    return "dry";
  }
  const cmd = `npx --yes vercel env add ${key} ${ENVIRONMENT} --force --yes --scope ${SCOPE}`;

  const runAdd = () =>
    spawnSync(cmd, {
      cwd: ROOT,
      input: value,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
      shell: true,
    });

  let res = runAdd();
  if (res.status === 0) return "added";

  const err = `${res.stderr ?? ""}${res.stdout ?? ""}`;
  if (err.includes("already exists") || err.includes("ENV_ALREADY_EXISTS")) {
    spawnSync(
      `npx --yes vercel env rm ${key} ${ENVIRONMENT} --yes --scope ${SCOPE}`,
      { cwd: ROOT, stdio: "pipe", encoding: "utf8", shell: true },
    );
    res = runAdd();
    if (res.status === 0) return "updated";
  }
  if (process.env.DEBUG_VERCEL_ENV_SYNC === "1") {
    console.warn(res.stderr || res.stdout);
  }
  console.warn(`  ⚠ ${key} — sync failed`);
  return "failed";
}

async function main() {
  console.log(
    `\n━━ Vercel env sync: ${SOURCE_PROJECT} → ${TARGET_PROJECT} (${ENVIRONMENT}) ━━\n`,
  );

  console.log(`1/4 Source keys from ${SOURCE_PROJECT}…`);
  const sourceKeys = listProjectKeys(SOURCE_PROJECT).filter((k) => !shouldSkip(k));
  console.log(`   → ${sourceKeys.length} app keys on source\n`);

  console.log("2/4 Resolve values (local env files + pull)…");
  const local = mergeLocalValues();
  const pulled = pullSourceValues();
  const values = { ...pulled, ...local };
  for (const [k, v] of Object.entries(EXTRA_FOR_TARGET)) {
    if (!values[k]?.trim()) values[k] = v;
  }

  const missingValues = sourceKeys.filter((k) => !values[k]?.trim());
  if (missingValues.length > 0) {
    console.warn(
      `   ⚠ 값 없음 (${missingValues.length}): ${missingValues.slice(0, 8).join(", ")}` +
        (missingValues.length > 8 ? "…" : "") +
        "\n   → my-app/.env.local 또는 Vercel Shared Env 확인\n",
    );
  }

  const keysToSync = [
    ...new Set([
      ...sourceKeys,
      ...Object.keys(EXTRA_FOR_TARGET),
    ]),
  ].filter((k) => !shouldSkip(k) && values[k]?.trim());

  console.log(`   → ${keysToSync.length} keys ready to push\n`);

  console.log(`3/4 Link target: ${TARGET_PROJECT}`);
  linkProject(TARGET_PROJECT);

  const existing = new Set(listProjectKeys(TARGET_PROJECT));
  console.log(`4/4 Push to target (existing: ${existing.size})…\n`);

  let added = 0;
  let updated = 0;
  let failed = 0;

  for (const key of keysToSync.sort()) {
    const result = addEnv(key, values[key]);
    if (result === "added") {
      console.log(`  ✅ ${key}${existing.has(key) ? "" : " (new)"}`);
      added++;
    } else if (result === "updated") {
      console.log(`  🔄 ${key}`);
      updated++;
    } else if (result === "failed") {
      failed++;
    }
  }

  console.log(
    `\nDone: ${added} added, ${updated} updated, ${failed} failed` +
      (dryRun ? " (dry-run)" : "") +
      "\n",
  );

  if (!dryRun && failed === 0 && keysToSync.length > 0) {
    console.log(
      `다음: nuguzip-homepage 재배포\n` +
        `  npm run deploy:vercel:homepage-prod\n`,
    );
  }

  if (failed > 0 || keysToSync.length === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
