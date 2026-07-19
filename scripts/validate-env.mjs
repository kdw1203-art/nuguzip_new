import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const strict = process.env.STRICT_ENV_CHECK === "1";
const isProduction = process.env.NODE_ENV === "production";

/**
 * 운영/배포 필수 환경변수 사전 검증.
 * - 기본: 경고만 출력
 * - STRICT_ENV_CHECK=1: 누락 시 빌드 실패
 */
const required = [
  "AUTH_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
];

const alternatives = [
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
];

const optionalProductionWarnings = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_DIRECT_URL",
  "OPENAI_API_KEY",
  "TOSS_SECRET_KEY",
  "NEXT_PUBLIC_TOSS_CLIENT_KEY",
  "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID",
  "MOLIT_SERVICE_KEY",
  "SEOUL_DATA_API_KEY",
  "VWORLD_API_KEY",
];

const businessDisclosureKeys = [
  "NEXT_PUBLIC_COMPANY_REPRESENTATIVE",
  "NEXT_PUBLIC_COMPANY_REGISTRATION_NUMBER",
  "NEXT_PUBLIC_COMPANY_ADDRESS",
  "NEXT_PUBLIC_MAIL_ORDER_SALES_NUMBER",
];

function isMissing(key) {
  return !String(process.env[key] ?? "").trim();
}

const missingRequired = required.filter(isMissing);
const missingAlternatives = alternatives.filter((keys) => keys.every(isMissing));
const missingOptional = optionalProductionWarnings.filter(isMissing);

if (missingRequired.length > 0 || missingAlternatives.length > 0) {
  const missing = [
    ...missingRequired,
    ...missingAlternatives.map((keys) => `${keys.join(" or ")}`),
  ];
  console.warn(
    `[env-check] missing required env: ${missing.join(", ")}`,
  );
}

if (isProduction && missingOptional.length > 0) {
  console.warn(
    `[env-check] recommended for production: ${missingOptional.join(", ")}`,
  );
}

const missingBusiness = businessDisclosureKeys.filter(isMissing);
if (isProduction && missingBusiness.length > 0) {
  console.warn(
    `[env-check] business disclosure incomplete (footer/terms/pricing): ${missingBusiness.join(", ")}`,
  );
}

if (strict && (missingRequired.length > 0 || missingAlternatives.length > 0)) {
  const missing = [
    ...missingRequired,
    ...missingAlternatives.map((keys) => `${keys.join(" or ")}`),
  ];
  console.error(
    `[env-check] STRICT_ENV_CHECK=1, failing build due to missing env: ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.info(
  `[env-check] complete (strict=${strict ? "on" : "off"}, production=${isProduction ? "yes" : "no"})`,
);
