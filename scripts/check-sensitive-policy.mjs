/**
 * 성범죄/민감정보 UI 정책 정적 점검.
 * - 주소 단위 성범죄/사건 필드 렌더 금지 패턴
 * - SAFETY_UI_POLICY / aggregate 라벨 존재
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = join(process.cwd(), "app");
const lib = join(process.cwd(), "lib");
const failures = [];

const FORBIDDEN = [
  /sexOffender/i,
  /성범죄자\s*주소/,
  /주소별\s*성범죄/,
  /crimeRiskAddress/i,
  /individualAddressCrime/i,
];

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if ([".ts", ".tsx", ".js", ".jsx"].includes(extname(p))) {
      out.push(p);
    }
  }
  return out;
}

const policyPath = join(process.cwd(), "lib/compliance/platform-policy.ts");
const policy = readFileSync(policyPath, "utf8");
if (!policy.includes("SAFETY_UI_POLICY")) {
  failures.push("SAFETY_UI_POLICY missing in platform-policy.ts");
}
if (!policy.includes("allowIndividualAddress: false")) {
  failures.push("allowIndividualAddress must be false");
}

const files = [...walk(root), ...walk(lib)];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const re of FORBIDDEN) {
    if (re.test(text)) {
      failures.push(`${file}: matches ${re}`);
    }
  }
}

const workspace = readFileSync(
  join(process.cwd(), "lib/map/district-workspace-service.ts"),
  "utf8",
);
if (/위험\s*\$\{/.test(workspace) && !/치안지수|집계/.test(workspace)) {
  failures.push("district-workspace-service: safety chip still uses raw '위험' without aggregate label");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("sensitive-policy static check OK");
