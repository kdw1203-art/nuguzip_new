#!/usr/bin/env node
/**
 * G9 — PWA 아이콘 SVG → PNG 변환
 * 사용: npm run icons:png   (public/icons/*.svg 를 고친 뒤에만 다시 돌리면 된다)
 *
 * 왜 PNG 가 따로 필요한가:
 *  - Safari 는 `apple-touch-icon` 으로 SVG 를 받지 않는다. SVG 만 두면 iOS 홈 화면에
 *    아이콘 대신 페이지 스크린샷 축소판이 박힌다(에러 없이 조용히).
 *  - 안드로이드 알림 트레이도 SVG 를 렌더하지 않아 기본 종 아이콘으로 대체된다.
 *  - manifest 의 maskable 아이콘은 런처가 실제로 잘라 쓰므로 래스터가 안전하다.
 * 그래서 원본은 SVG 로 두고, 배포물에는 PNG 를 함께 넣는다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* sharp 는 이 저장소의 직접 의존성이 아니라 next 의 **optional** 의존성으로 딸려 온다.
   optional 은 말 그대로 설치가 실패해도 npm 이 조용히 넘어간다는 뜻이라, 어떤 머신에선
   있고 어떤 머신에선 없다. 그냥 import 하면 그때 ERR_MODULE_NOT_FOUND 스택만 뜨고
   "왜 없는지" 는 안 나온다. 여기서 잡아 무엇을 하면 되는지까지 알려준다.
   (PNG 결과물은 저장소에 커밋돼 있으므로, 이 스크립트는 SVG 를 고칠 때만 돌리면 된다.) */
let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error(
    "✗ sharp 를 불러올 수 없습니다.\n" +
      "  sharp 는 next 의 optional 의존성이라 설치가 건너뛰어졌을 수 있습니다.\n" +
      "  → npm i -D sharp 후 다시 실행하세요. (아이콘 PNG 는 이미 커밋돼 있으므로,\n" +
      "     public/icons/*.svg 를 수정하지 않았다면 이 스크립트를 돌릴 필요가 없습니다.)",
  );
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = path.join(ROOT, "public", "icons");

/* 원본 SVG 는 font-family 로 Pretendard 를 지정한다. 래스터화하는 머신(CI·컨테이너)에
   Pretendard 가 깔려 있을 리 없고, 폰트를 못 찾으면 '집' 이 두부(□)로 렌더된다.
   에러가 아니라 그냥 네모가 박힌 아이콘이 나오므로 눈으로 확인하기 전엔 모른다.
   렌더링용 사본에서만 시스템 CJK 폰트로 바꾼다 — 웹에 나가는 SVG 원본은 그대로 둔다. */
const CJK_STACK = "Noto Sans CJK KR, Noto Sans KR, Apple SD Gothic Neo, sans-serif";
const toRenderable = (svg) => svg.replace(/font-family="[^"]*"/g, `font-family="${CJK_STACK}"`);

const TARGETS = [
  ["icon-192.svg", "icon-192.png", 192],
  ["icon-512.svg", "icon-512.png", 512],
  ["icon-maskable.svg", "icon-maskable.png", 512],
];

let failed = false;

for (const [srcName, outName, size] of TARGETS) {
  const src = path.join(ICONS, srcName);
  if (!fs.existsSync(src)) {
    console.error(`✗ 원본 없음: public/icons/${srcName}`);
    failed = true;
    continue;
  }
  const svg = toRenderable(fs.readFileSync(src, "utf8"));
  const out = path.join(ICONS, outName);
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(out);

  const meta = await sharp(out).metadata();
  if (meta.width !== size || meta.height !== size) {
    console.error(`✗ ${outName} 크기 불일치: ${meta.width}x${meta.height} (기대 ${size}x${size})`);
    failed = true;
    continue;
  }
  console.log(`✓ public/icons/${outName} — ${size}x${size}, ${fs.statSync(out).size}B`);
}

console.log(
  "\n한글 글리프가 네모(□)로 나오지 않았는지 눈으로 한 번 확인하세요 — 폰트 폴백 실패는 조용히 일어납니다.",
);
process.exit(failed ? 1 : 0);
