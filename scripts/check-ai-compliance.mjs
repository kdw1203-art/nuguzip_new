#!/usr/bin/env node
/* [AI-06] AI 컴플라이언스 렌더 강제 — 워크벤치·공유 화면에 면책이 실제로 붙어
 * 있는지 소스에서 검사한다. 투자 조언 오해는 화면 하나의 누락에서 시작되므로,
 * "조심하자"가 아니라 빌드 실패로 강제한다.
 * 사용: node ./scripts/check-ai-compliance.mjs (npm run build 체인 포함) */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "[check-ai-compliance]";
const read = (p) => readFileSync(join(root, p), "utf8");

const RULES = [
  {
    file: "app/analysis/ai/[tool]/page.tsx",
    must: ['data-ai-compliance="notice"', "투자 권유", "책임"],
    why: "워크벤치 전 도구 공통 면책",
  },
  {
    file: "app/analysis/ai/r/[id]/page.tsx",
    must: ["투자 권유"],
    why: "공유 화면에도 면책 — 로그인 없이 열리는 표면",
  },
  {
    file: "lib/ai/system-prompt.ts",
    must: ["수익 보장", "AI_PROMPT_VERSION"],
    why: "프롬프트의 수익보장 금지 조항 + 버전 체계(AI-49)",
  },
  {
    file: "app/analysis/ai/[tool]/WorkbenchClient.tsx",
    must: ["[규칙]", "근거 각주"],
    why: "출처 라벨(AI-05)·각주(AI-01) 표면",
  },
];

let failed = 0;
for (const rule of RULES) {
  let body = "";
  try {
    body = read(rule.file);
  } catch {
    failed += 1;
    console.error(`${TAG} FAIL — ${rule.file} 을 읽지 못함 (${rule.why})`);
    continue;
  }
  for (const needle of rule.must) {
    if (!body.includes(needle)) {
      failed += 1;
      console.error(`${TAG} FAIL — ${rule.file} 에서 필수 표기가 사라짐: ${needle}\n      근거: ${rule.why}`);
    }
  }
}

if (failed > 0) {
  console.error(`${TAG} ${failed}건 어긋남 — 빌드를 멈춥니다.`);
  process.exit(1);
}
console.info(`${TAG} PASS — AI 면책·라벨 표기 ${RULES.reduce((n, r) => n + r.must.length, 0)}건 확인`);
