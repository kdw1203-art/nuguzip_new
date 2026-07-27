#!/usr/bin/env node
/**
 * 색 토큰 대비 게이트.
 *
 * app/globals.css 의 15b 주석은 규칙을 이렇게 적어 두었다 —
 * "각 상태 bg/border/text 3토큰 고정 (bg 위 text 대비 4.5:1)".
 * 그런데 2026-07-27 에 확인해 보니 정작 위험(danger)만 그 규칙을 어기고 있었다:
 *   구 --danger #d64545 → 흰 배경 4.38 · --bg 4.15 · --danger-soft 3.77 (전부 미달)
 *   구 --success #1a7f4e → --success-soft 위 4.46 (아슬하게 미달)
 * 발견한 계기는 axe 가 /town 한 화면에서 3.77 을 잡은 것인데, text-danger 는
 * 소스 91곳에 쓰인다. 화면마다 고치면 나머지 90곳은 그대로 남고, 다음에 누가
 * text-danger 를 새로 쓰면 위반이 다시 태어난다. 규칙이 토큰에 있으니 검사도
 * 토큰에서 한다.
 *
 * 접근성 e2e(test:a11y)와 겹치지 않는다: 그쪽은 "지금 렌더된 화면"을 보고,
 * 이쪽은 "쓰이든 안 쓰이든 조합 자체가 성립하는가"를 본다. 화면에 아직 안 쓰인
 * 조합은 axe 가 볼 수 없다.
 *
 * 검사 대상은 디자인 시스템이 스스로 약속한 조합만 둔다. 실제로 쓰이는지
 * 정적으로 알 수 없는 조합(예: text-3 를 danger-soft 위에)까지 넣으면 오탐이
 * 섞이고, 오탐이 섞이는 순간 게이트는 무시당한다.
 *
 * 사용: npm run check:contrast-tokens
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CSS = path.join(ROOT, "app/globals.css");
const AA = 4.5; // WCAG 2.1 AA 본문 최소

/* ---------- 색 파싱·계산 ---------- */

function parseHex(v) {
  const h = v.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function parseRgba(v) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(
    v.trim(),
  );
  if (!m) return null;
  return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
}

/** 반투명 토큰은 그 위에 깔리는 배경과 합성해야 실제로 보이는 색이 된다. */
function resolve(value, over) {
  const hex = parseHex(value);
  if (hex) return hex;
  const rgba = parseRgba(value);
  if (!rgba) return null;
  if (rgba.a >= 1) return rgba.rgb;
  if (!over) return null;
  return rgba.rgb.map((c, i) => Math.round(c * rgba.a + over[i] * (1 - rgba.a)));
}

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ---------- 토큰 블록 읽기 ---------- */

/**
 * `:root {` / `.dark {` 블록 안의 `--token: value;` 를 모은다.
 * 중괄호 깊이를 세서 블록 끝을 찾는다(안에 @media 등이 중첩돼도 안전하게).
 */
function readBlock(src, selector) {
  const at = src.indexOf(selector);
  if (at < 0) throw new Error(`[check-contrast-tokens] ${selector} 블록을 찾지 못했습니다.`);
  const open = src.indexOf("{", at);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`[check-contrast-tokens] ${selector} 블록이 닫히지 않았습니다.`);
  const body = src.slice(open + 1, end);
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].split("/*")[0].trim();
  }
  return out;
}

/* ---------- 검사 조합 ---------- */

const TONES = ["danger", "success", "warning", "primary"];
const RAMP = ["ink", "text-1", "text-2", "text-3"];
/** 본문이 얹힐 수 있는 배경 — 상태 카드 안에 캡션을 쓰는 건 자연스러운 일이라
    상태 soft 3종도 약속 대상에 넣는다. 2026-07-27 에 넣고 재 보니 --text-3 만
    danger-soft 위 4.39(라이트) / 3.87~4.27(다크) 로 걸렸다. */
const TEXT_BACKGROUNDS = [
  "surface",
  "bg",
  "disabled-bg",
  "danger-soft",
  "success-soft",
  "warning-soft",
  "primary-soft",
];

/** [전경 토큰, 배경 토큰] — 디자인 시스템이 스스로 약속한 조합만. */
function pairs() {
  const list = [];
  for (const t of TONES) {
    list.push([t, "surface"], [t, "bg"], [t, `${t}-soft`]);
  }
  for (const r of RAMP) for (const b of TEXT_BACKGROUNDS) list.push([r, b]);
  return list;
}

/**
 * 채움 토큰 — 전경이 항상 흰 글씨인 자리(솔리드 배지·버튼).
 * 본문용 --danger/--success 는 다크에서 밝은 색으로 뒤집히므로 채움에 쓰면
 * 흰 글씨가 2.4:1 까지 무너진다. 그래서 채움값은 테마 고정이고, 여기서는
 * (1) 흰 글씨가 AA 를 넘는가 (2) 배지 자체가 표면과 3:1 로 구분되는가 를 본다.
 */
const FILLS = ["danger-fill", "success-fill"];
const NON_TEXT_MIN = 3; // WCAG 1.4.11 비텍스트 최소

function check(themeName, tokens) {
  const surface = resolve(tokens.surface, null);
  if (!surface) {
    throw new Error(`[check-contrast-tokens] ${themeName}: --surface 를 읽지 못했습니다.`);
  }
  const rows = [];
  for (const [fgKey, bgKey] of pairs()) {
    const fgRaw = tokens[fgKey];
    const bgRaw = tokens[bgKey];
    if (fgRaw === undefined || bgRaw === undefined) {
      /* 다크는 오버라이드만 적는다 — 없으면 라이트 값을 그대로 쓴다는 뜻이라
         라이트 쪽 검사에서 이미 봤다. 여기서 실패로 셀 일이 아니다. */
      continue;
    }
    /* 배경이 반투명이면 --surface 위에 깔린다고 보고 합성한다(카드 위가 기본). */
    const bg = resolve(bgRaw, surface);
    const fg = resolve(fgRaw, bg ?? surface);
    if (!fg || !bg) {
      rows.push({ fgKey, bgKey, ratio: null, ok: false, note: "색을 해석하지 못함" });
      continue;
    }
    const ratio = contrast(fg, bg);
    rows.push({ fgKey, bgKey, ratio, ok: ratio >= AA, fg, bg });
  }
  for (const fillKey of FILLS) {
    const fill = resolve(tokens[fillKey], surface);
    if (!fill) {
      rows.push({ fgKey: "#fff", bgKey: fillKey, ratio: null, ok: false, note: "색을 해석하지 못함" });
      continue;
    }
    const white = contrast([255, 255, 255], fill);
    rows.push({ fgKey: "#fff", bgKey: fillKey, ratio: white, ok: white >= AA });
    const vsSurface = contrast(fill, surface);
    rows.push({
      fgKey: fillKey,
      bgKey: "surface(비텍스트)",
      ratio: vsSurface,
      ok: vsSurface >= NON_TEXT_MIN,
      min: NON_TEXT_MIN,
    });
  }
  return rows;
}

/**
 * 폐기된 팔레트 값이 하드코딩으로 되살아나는 걸 막는다.
 * 2026-07-27 토큰 정정 뒤에도 #d64545 / #1a7f4e 가 소스 40여 파일에 hex 로
 * 남아 있었다. 토큰이 아니니 정정이 상속되지 않아, 공개 화면에서 3.77~4.46 이
 * 그대로 살아 있었다. 값 하나를 고치는 것보다 "다시 못 들어오게" 하는 게 싸다.
 */
const DEAD_HEX = ["#d64545", "#1a7f4e"];

function scanDeadHex() {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        walk(p);
      } else if (/\.tsx?$/.test(e.name)) {
        const text = fs.readFileSync(p, "utf8");
        text.split("\n").forEach((line, i) => {
          for (const hex of DEAD_HEX) {
            if (line.toLowerCase().includes(hex)) {
              hits.push(`  ${path.relative(ROOT, p)}:${i + 1}  ${hex}`);
            }
          }
        });
      }
    }
  };
  for (const d of ["app", "lib"]) {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) walk(abs);
  }
  return hits;
}

/* ---------- 실행 ---------- */

const src = fs.readFileSync(CSS, "utf8");
const themes = [
  ["light", readBlock(src, ":root")],
  ["dark", { ...readBlock(src, ":root"), ...readBlock(src, ".dark") }],
];

const failed = [];
for (const [name, tokens] of themes) {
  const rows = check(name, tokens);
  if (rows.length === 0) {
    throw new Error(`[check-contrast-tokens] ${name}: 검사할 조합이 하나도 없습니다.`);
  }
  console.log(`[check-contrast-tokens] ${name} — ${rows.length}조합`);
  for (const r of rows) {
    if (r.ok) continue;
    const label = (k) => (k.startsWith("#") || k.includes("(") ? k : `--${k}`);
    failed.push(
      `  ${name}  ${label(r.fgKey)} on ${label(r.bgKey)}  ` +
        (r.ratio === null ? r.note : `${r.ratio.toFixed(2)}:1 (최소 ${r.min ?? AA}:1)`),
    );
  }
}

if (failed.length) {
  console.error("[check-contrast-tokens] 대비 미달 조합:");
  for (const f of failed) console.error(f);
  console.error(
    "\napp/globals.css 의 토큰 값을 조정하세요. 화면 한 곳만 우회하면 같은 토큰을 " +
      "쓰는 나머지 자리가 그대로 남습니다.",
  );
  process.exit(1);
}

const dead = scanDeadHex();
if (dead.length) {
  console.error(`[check-contrast-tokens] 폐기된 팔레트 값이 하드코딩돼 있습니다 (${dead.length}곳):`);
  for (const d of dead) console.error(d);
  console.error(
    `\n${DEAD_HEX.join(" / ")} 는 2026-07-27 대비 정정으로 팔레트에서 내려간 값입니다.\n` +
      "클래스라면 text-danger / bg-success-soft 같은 토큰으로, 차트·마커처럼 토큰을 " +
      "쓸 수 없는 자리라면 현재 값(#c62828 / #177a4a)으로 바꾸세요.",
  );
  process.exit(1);
}

console.log(`[check-contrast-tokens] OK — 라이트·다크 전 조합 통과 · 폐기 팔레트 hex 0곳.`);
