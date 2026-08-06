/**
 * 공개 표시명 컬럼에 **원본 이메일을 폴백으로 넣는** 호출부 점검.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────────────────
 * 같은 결함이 세 번 났다. 전부 모양이 똑같다:
 *
 *     authorLabel: session.user.name ?? session.user.email
 *
 * `author_label` 은 anon 이 읽는 공개 컬럼이고, 화면 코드는 라벨이 있으면
 * 그대로 찍는다(`if (label?.trim()) return label.trim()`). 그래서 이름을 설정한
 * 적 없는 계정은 노트·임장기록·리포트를 만들 때마다 자기 이메일 주소를 공개했다.
 * 옆 컬럼(author_id/author_email)을 아무리 가려도, 표시명 자리로 같은 값이
 * 나가면 아무것도 가린 게 아니다.
 *
 * ── 무엇을 잡는가 (정확히) ───────────────────────────────────────────────
 * `authorLabel:` / `author_label:` 의 값 식에서 `??` 또는 `||` 의 **오른쪽이
 * 가공되지 않은 이메일**인 경우만 잡는다. 이메일을 받아 **무언가 하는** 것은
 * 통과시킨다 — `email.split("@")[0]`, `maskEmailPublic(email)`,
 * `authorLabel(name, email)` 은 전부 정상이다.
 *
 * 좁게 잡은 이유: 넓게 잡으면 멀쩡한 마스킹 호출까지 걸려 아무도 안 보게 된다.
 * 가끔 틀리는 게이트는 아무도 안 보는 게이트다.
 *
 * ── 이 검사기가 실제로 잡는지 확인하는 법 ────────────────────────────────
 *   node scripts/check-public-label-email.mjs --selftest
 * 고치기 전 코드 3줄을 그대로 넣어 잡히는지, 지금 코드가 통과하는지 같이 본다.
 * 고쳐 놓고 0건이 나오는 건 아무것도 증명하지 않는다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = process.cwd();

/** `??`/`||` 뒤에 곧바로 오는 (가공 안 된) 이메일 참조. */
const RAW_EMAIL_FALLBACK = /(\?\?|\|\|)\s*(?:[\w$?.]*\.)?email\b(?![\s]*[.?[(])/;
/** 표시명 프로퍼티 이름 */
const LABEL_PROP = /\bauthor_?[Ll]abel\s*:/;

/** 값 식은 다음 줄로 넘어가기도 한다. 프로퍼티 줄부터 3줄을 붙여 본다. */
const WINDOW = 3;

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if ([".ts", ".tsx"].includes(extname(p))) out.push(p);
  }
  return out;
}

/** 소스 한 벌에서 위반을 찾아 돌려준다. 파일 시스템과 분리해 자가진단에 재사용한다. */
export function findViolations(text, label = "<input>") {
  const lines = text.split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (!LABEL_PROP.test(lines[i])) continue;
    const expr = lines.slice(i, i + WINDOW).join(" ");
    // 프로퍼티 이름 뒤쪽(값 식)만 본다.
    const rhs = expr.slice(expr.search(LABEL_PROP)).replace(LABEL_PROP, "");
    if (RAW_EMAIL_FALLBACK.test(rhs)) {
      hits.push({ file: label, line: i + 1, text: lines[i].trim() });
    }
  }
  return hits;
}

/* ── 자가진단 ──────────────────────────────────────────────────────────── */
if (process.argv.includes("--selftest")) {
  // 실제로 저장소에 있었던 세 줄 (커밋 전 상태)
  const BAD = [
    `      authorLabel: session.user.name ?? session.user.email,`,
    `    authorLabel: session?.user?.name ?? email,`,
    `      author_label: input.authorLabel ?? user.email,`,
  ];
  // 지금 저장소에 있는, 통과해야 하는 줄들
  const GOOD = [
    `      authorLabel: session.user.name?.trim() || undefined,`,
    `  const authorLabel = session.user.name?.trim() || session.user.email?.split("@")[0]?.trim() || "회원";`,
    `      authorLabel: authorLabel(session.user.name, session.user.email),`,
    `      authorLabel: session.user.name ?? undefined,`,
    `    author_label: input.authorLabel ?? null,`,
    `      authorLabel: safePublicAuthorLabel(label, email),`,
  ];
  let bad = 0;
  for (const line of BAD) {
    const n = findViolations(line).length;
    if (n === 0) {
      bad++;
      console.error(`✗ 못 잡음(잡아야 함): ${line.trim()}`);
    }
  }
  for (const line of GOOD) {
    const n = findViolations(line).length;
    if (n > 0) {
      bad++;
      console.error(`✗ 잘못 잡음(통과해야 함): ${line.trim()}`);
    }
  }
  console.log(
    bad === 0
      ? `✔ 자가진단 통과 — 잡아야 할 ${BAD.length}줄 전부 잡고, 통과해야 할 ${GOOD.length}줄 전부 통과`
      : `✗ 자가진단 실패 ${bad}건`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

/* ── 본 검사 ──────────────────────────────────────────────────────────────
   `findViolations` 를 import 만 해도 전수 검사가 돌면 곤란하다(고치기 전 소스에
   이 검사기를 대 보려면 import 해야 한다). 직접 실행할 때만 돈다. */
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (invokedDirectly) {
  const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib"))];
  const failures = [];
  for (const file of files) {
    for (const h of findViolations(readFileSync(file, "utf8"), relative(ROOT, file))) {
      failures.push(`${h.file}:${h.line}  ${h.text}`);
    }
  }

  if (failures.length > 0) {
    console.error("✗ 공개 표시명에 원본 이메일이 폴백으로 들어갑니다:");
    for (const f of failures) console.error(`  - ${f}`);
    console.error(
      "\n  표시명이 없으면 넘기지 마세요(undefined). 저장소가 마스킹하거나 화면 폴백이 처리합니다.",
    );
    process.exit(1);
  }
  console.log(`✔ 공개 표시명 이메일 폴백 없음 (검사 ${files.length}개 파일 · app/ + lib/)`);
}
