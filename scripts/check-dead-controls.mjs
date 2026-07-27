#!/usr/bin/env node
/**
 * 장식용 컨트롤 게이트 — "눌러도 아무 일도 안 일어나는 것"을 CI 에서 막는다.
 *
 * ── 왜 만들었나 ─────────────────────────────────────────────────────────────
 * 2026-07-27, 런칭 준비 중에 가입 화면에서
 *   <span className="rounded-full …">⌕ 검색</span>
 * 이 발견됐다. 검색창처럼 생겼지만 onClick 이 없는 <span> 이라 눌러도 아무 반응이
 * 없었다. 전수 조사해 보니 같은 종류가 사이트 전반에 40곳 넘게 있었다 —
 * 핸들러 없는 <button>, 지도 날짜 탭인 척하는 <span> 3개, `▾` 만 그려 둔 가짜
 * 드롭다운, href="#" 링크.
 *
 * 하나씩 고치는 것으로는 재발을 못 막는다. 사람이 리뷰에서 잡아내기에는
 * 너무 조용한 결함이라(타입도 통과하고, 테스트도 통과하고, 화면도 멀쩡하다)
 * 기계가 봐야 한다.
 *
 * ── 무엇을 잡는가 ───────────────────────────────────────────────────────────
 *  A. 핸들러가 없는 <button> — onClick·type="submit"·form·formAction·disabled 중
 *     하나도 없는 버튼. 눌러도 아무 일이 없거나(클라이언트) 아예 불가능하다(서버 컴포넌트).
 *  B. 컨트롤 어포던스 글리프(`▾` `⌕` `✎`)를 가진 <span>/<div> — 드롭다운·검색·편집
 *     처럼 보이게 만드는 문자인데 정작 컨트롤이 아니다.
 *  C. href="#" · href="" — 아무 데도 가지 않는 링크.
 *
 * 일부러 안 잡는 것: 텍스트 스타일용 <span>(정상), `›` 셰브론(진짜 Link 안에서
 * 널리 쓰인다 — 글리프만으로는 판별이 안 돼 오탐이 너무 많다).
 *
 * ── 예외 ────────────────────────────────────────────────────────────────────
 * 정당한 사유가 있으면 바로 윗줄에 `dead-control-ok: <이유>` 주석을 단다.
 * 이유를 적게 하는 것이 핵심이다 — 억제 자체보다 "왜 괜찮은지"가 남아야 한다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];
const ALLOW_MARK = "dead-control-ok";

/** 버튼이 살아 있다고 인정하는 속성 */
const LIVE_BUTTON_ATTRS = [
  "onClick",
  "onMouseDown",
  "onPointerDown",
  "onKeyDown",
  "type=\"submit\"",
  "type={\"submit\"}",
  "formAction",
  "form=",
  "disabled",
  "{...",           // 스프레드로 핸들러가 들어올 수 있다
];

const GLYPH_RULES = [
  { glyph: "▾", why: "드롭다운처럼 보이는 캐럿" },
  { glyph: "⌕", why: "검색창처럼 보이는 돋보기" },
  { glyph: "✎", why: "편집 가능한 것처럼 보이는 연필" },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * 주석 내용을 같은 길이의 공백으로 지운 사본.
 *
 * 왜 필요한가: 이 저장소의 주석은 "예전에 `<button>` 이 onClick 없이 있었다"
 * 처럼 **고친 내역을 그대로 적어 둔다**. 주석을 안 지우면 그 설명문 자체가
 * 위반으로 잡혀서, 잘 고친 파일일수록 더 많이 신고당한다.
 * 줄 번호가 어긋나지 않게 길이와 줄바꿈은 그대로 둔다.
 */
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out
    .split("\n")
    .map((line) => {
      const t = line.trimStart();
      // 줄 전체가 주석인 경우만 지운다 — 문자열 안의 "https://" 를 자르지 않기 위해.
      return t.startsWith("//") || t.startsWith("*") ? " ".repeat(line.length) : line;
    })
    .join("\n");
  return out;
}

/**
 * `<button` 뒤부터 여는 태그가 끝나는 `>` 까지의 속성 문자열.
 *
 * 중괄호 깊이를 세는 이유: JSX 속성값 안에는 `>` 가 흔하다
 * (`onClick={() => f()}`, `aria-expanded={n > 0}`). 그 `>` 를 태그 끝으로
 * 오해하면 onClick 이 잘려 나가면서 살아 있는 버튼을 죽었다고 신고한다.
 * 닫는 `>` 를 못 찾으면 null — 억지로 판정하지 않는다.
 */
function readOpenTag(src, from) {
  let depth = 0;
  for (let i = from; i < src.length && i - from < 4000; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(from, i);
  }
  return null;
}

/** 그 줄(또는 바로 윗줄)에 예외 표시가 있는가 */
function allowed(lines, index) {
  const here = lines[index] ?? "";
  const above = lines[index - 1] ?? "";
  return here.includes(ALLOW_MARK) || above.includes(ALLOW_MARK);
}

const findings = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const raw = readFileSync(file, "utf8");
    /* 예외 표시(dead-control-ok)는 주석에 적히므로 원본 줄로 확인하고,
       위반 탐지는 주석을 지운 사본에서 한다. */
    const lines = raw.split("\n");
    const src = stripComments(raw);
    const codeLines = src.split("\n");
    const rel = relative(ROOT, file);

    // ── A. 핸들러 없는 <button>
    // 여는 태그 전체를 읽는다. `onClick={() => f()}` 의 `=>` 나
    // `aria-expanded={a > b}` 처럼 중괄호 **안**에 나오는 `>` 는 태그의 끝이
    // 아니다 — 단순 정규식으로 자르면 여기서 오탐이 쏟아진다. 중괄호 깊이를
    // 세면서 깊이 0 의 `>` 를 만날 때까지 읽는다.
    for (const m of src.matchAll(/<button\b/g)) {
      const attrs = readOpenTag(src, m.index + "<button".length);
      if (attrs === null) continue; // 태그가 안 닫힌다 — 파싱 포기(오탐 방지)
      if (LIVE_BUTTON_ATTRS.some((a) => attrs.includes(a))) continue;
      const line = src.slice(0, m.index).split("\n").length - 1;
      if (allowed(lines, line)) continue;
      findings.push({
        file: rel,
        line: line + 1,
        rule: "handler-less-button",
        detail: "onClick·submit·form·disabled 중 아무것도 없는 <button> — 눌러도 아무 일이 없습니다.",
      });
    }

    // ── B. 컨트롤 어포던스 글리프를 가진 비(非)컨트롤
    codeLines.forEach((text, i) => {
      for (const { glyph, why } of GLYPH_RULES) {
        if (!text.includes(glyph)) continue;
        if (allowed(lines, i)) continue;
        /* 근처에 진짜 컨트롤이 있으면 통과. 창을 넉넉히(앞뒤 8줄) 잡는 이유:
           JSX 에서 글리프는 여는 태그보다 한참 아래에 온다 —
           <button ...여러 줄의 className...> ▾ </button> 처럼. 창이 좁으면
           멀쩡한 버튼 안의 캐럿까지 신고한다. */
        const around = codeLines.slice(Math.max(0, i - 8), i + 8).join("\n");
        const isControl =
          /<(button|select|input|textarea|a\s|Link\b)/.test(around) ||
          /onClick|onChange|href=/.test(around);
        if (isControl) continue;
        findings.push({
          file: rel,
          line: i + 1,
          rule: "fake-affordance",
          detail: `${why}("${glyph}")가 컨트롤이 아닌 곳에 있습니다.`,
        });
      }
    });

    // ── C. 아무 데도 가지 않는 링크
    codeLines.forEach((text, i) => {
      if (!/href=("#"|""|\{"#"\})/.test(text)) return;
      if (allowed(lines, i)) return;
      findings.push({
        file: rel,
        line: i + 1,
        rule: "dead-href",
        detail: 'href="#" · href="" — 아무 데도 가지 않는 링크입니다.',
      });
    });
  }
}

if (findings.length === 0) {
  console.log("✓ 장식용 컨트롤 없음 (handler-less-button · fake-affordance · dead-href)");
  process.exit(0);
}

console.error(`\n✗ 장식용 컨트롤 ${findings.length}건 발견\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.rule}]`);
  console.error(`     ${f.detail}`);
}
console.error(
  `\n고치는 방법:\n` +
    `  1) 실제 동작을 붙인다 (가장 좋음)\n` +
    `  2) 컨트롤처럼 보이게 하는 요소(테두리·패딩·색·글리프)를 걷어내 평범한 텍스트로 만든다\n` +
    `  3) 지운다\n` +
    `정당한 예외라면 바로 윗줄에 \`// ${ALLOW_MARK}: <이유>\` 를 적으세요. 이유는 필수입니다.\n`,
);
process.exit(1);
