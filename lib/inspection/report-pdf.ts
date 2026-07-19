import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { StructuredReport } from "@/lib/inspection/ontology";
import type { PdfBranding } from "@/lib/inspection/pdf-branding";

const FONT_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf";

let cachedFont: Uint8Array | null = null;

async function loadKoreanFont(): Promise<Uint8Array> {
  if (cachedFont) return cachedFont;
  const res = await fetch(FONT_URL);
  if (!res.ok) throw new Error("한글 폰트를 불러오지 못했습니다.");
  cachedFont = new Uint8Array(await res.arrayBuffer());
  return cachedFont;
}

type DrawCtx = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  margin: number;
  maxWidth: number;
  y: number;
};

function ensureSpace(ctx: DrawCtx, needed: number): DrawCtx {
  if (ctx.y - needed >= 48) return ctx;
  const page = ctx.pdfDoc.addPage([595, 842]);
  return { ...ctx, page, y: page.getSize().height - 48 };
}

function drawLines(ctx: DrawCtx, text: string, size = 11, gap = 4): DrawCtx {
  const lines = text.split(/\n/);
  let next = ctx;
  for (const line of lines) {
    if (!line.trim()) {
      next = { ...next, y: next.y - size - gap };
      continue;
    }
    next = ensureSpace(next, size + gap);
    next.page.drawText(line, {
      x: next.margin,
      y: next.y,
      size,
      font: next.font,
      color: rgb(0.12, 0.14, 0.18),
      maxWidth: next.maxWidth,
      lineHeight: size + 2,
    });
    const wrapped = Math.max(1, Math.ceil(line.length / 42));
    next = { ...next, y: next.y - (size + gap) * wrapped };
  }
  return next;
}

function drawBullets(ctx: DrawCtx, items: string[], size = 10): DrawCtx {
  let next = ctx;
  for (const item of items) {
    next = drawLines(next, `• ${item}`, size);
  }
  return next;
}

export async function buildInspectionReportPdf(opts: {
  title: string;
  region: string;
  startedAt: string;
  report: StructuredReport;
  branding?: PdfBranding;
}): Promise<Uint8Array> {
  const { title, region, startedAt, report, branding } = opts;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = await loadKoreanFont();
  const font = await pdfDoc.embedFont(fontBytes);

  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 48;
  const maxWidth = width - margin * 2;

  let ctx: DrawCtx = { pdfDoc, page, font, margin, maxWidth, y: height - margin };

  if (branding?.showProBadge) {
    const badge =
      branding.tier === "enterprise"
        ? "EXPERT"
        : branding.tier === "expert"
          ? "PRO"
          : "PLUS";
    ctx = drawLines(ctx, `Nuguzip ${badge}`, 9);
    ctx = { ...ctx, y: ctx.y - 4 };
  }

  ctx = drawLines(ctx, title, 18, 6);
  const dateStr = new Date(startedAt).toLocaleDateString("ko-KR");
  const meta = [region, dateStr, branding?.authorLabel].filter(Boolean).join(" · ");
  ctx = drawLines(ctx, meta, 10, 8);
  ctx = drawLines(ctx, `종합 ${report.scores.overall}점`, 14, 10);
  ctx = drawLines(ctx, report.topSummary, 11, 8);

  const scores = [
    ["교통", report.scores.transport],
    ["학군", report.scores.school],
    ["생활", report.scores.livability],
    ["상태", report.scores.condition],
    ["미래", report.scores.future_value],
  ] as const;
  ctx = drawLines(ctx, scores.map(([l, s]) => `${l} ${s}`).join("  ·  "), 10, 12);

  ctx = drawLines(ctx, "장점", 12, 6);
  ctx = drawBullets(ctx, report.strengths);
  ctx = drawLines(ctx, "단점", 12, 6);
  ctx = drawBullets(ctx, report.weaknesses);
  if (report.mustVerify.length) {
    ctx = drawLines(ctx, "추가 확인", 12, 6);
    ctx = drawBullets(ctx, report.mustVerify);
  }

  ctx = drawLines(ctx, report.disclaimer, 8, 4);
  if (branding?.footerLine) {
    ctx = drawLines(ctx, branding.footerLine, 8, 2);
  }

  return pdfDoc.save();
}
