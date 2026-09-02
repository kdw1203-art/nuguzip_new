"use client";

import { useEffect, useMemo, useState } from "react";
import { INLINE_CONFIRM_MS } from "@/lib/ui/feedback-timing";

/* ============================================================
   N17 — 시세 위젯 코드 생성기 (클라이언트).

   왜 클라이언트인가: 단지 id 를 서버 쿼리스트링으로 받으면 /widget 이
   동적 라우트가 되어 공개 캐시 대상에서 빠진다. id 는 화면을 만드는 데만
   쓰이므로(서버 조회 없음) 브라우저에서 읽는다.

   왜 "예시 단지"를 넣지 않았나: 미리보기는 실제 iframe 이다. 가짜 id 를
   기본값으로 넣으면 "단지 정보를 찾을 수 없어요" 카드가 뜨고, 그건 위젯이
   고장난 것처럼 보인다. 사용자가 실제 단지를 넣기 전까지는 빈 상태를 둔다.
   ============================================================ */

const SITE = "https://nuguzip.com";

export type WidgetTarget =
  | { kind: "complex"; id: string }
  | { kind: "region"; id: string };

/** 붙여넣은 문자열에서 대상(단지 또는 지역)을 뽑는다. URL 이든 id 자체든 받는다.
 *  [#88] 지역 페이지 주소(/region/{id})도 받는다 — 중개사무소용 지역 시세 위젯. */
export function parseWidgetTarget(input: string): WidgetTarget | null {
  const raw = input.trim();
  if (!raw) return null;

  // 1) 내집나우 단지 URL — /complex/{id} · /embed/complex/{id} (쿼리·해시 무시)
  const m = raw.match(/\/(?:embed\/)?complex\/([^/?#\s]+)/);
  if (m && m[1]) {
    try {
      return { kind: "complex", id: decodeURIComponent(m[1]) };
    } catch {
      return { kind: "complex", id: m[1] };
    }
  }

  // 2) 지역 URL — /region/{id} · /embed/region/{id}
  const r = raw.match(/\/(?:embed\/)?region\/([a-z0-9-]+)/);
  if (r && r[1]) return { kind: "region", id: r[1] };

  // 3) 다른 사이트 URL 을 붙여넣은 경우 — id 로 오인하지 않는다.
  if (/^https?:\/\//i.test(raw) || raw.includes("/")) return null;

  // 4) id 를 그대로 붙여넣은 경우 — 지역 id 형태(영소문자-하이픈)면 지역으로
  if (/^[a-z][a-z0-9-]*$/.test(raw)) return { kind: "region", id: raw };
  return { kind: "complex", id: raw };
}

/** 구 API 호환 — 단지 id 만 뽑던 함수 (테스트·외부 참조 보존) */
export function parseComplexId(input: string): string | null {
  const t = parseWidgetTarget(input);
  return t && t.kind === "complex" ? t.id : null;
}

function snippetFor(target: WidgetTarget, height: number): string {
  const src = `${SITE}/embed/${target.kind}/${encodeURIComponent(target.id)}`;
  const title = target.kind === "region" ? "내집나우 지역 시세 위젯" : "내집나우 실거래 시세 위젯";
  return `<iframe src="${src}" width="100%" height="${height}" style="border:0;max-width:400px" loading="lazy" title="${title}"></iframe>`;
}

export function WidgetBuilder() {
  const [input, setInput] = useState("");
  const [height, setHeight] = useState(260);
  const [copied, setCopied] = useState(false);

  // /complex/{id}·/region/{id} 에서 "위젯으로 퍼가기"로 넘어온 경우 자동 채움.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("complex");
    if (c) {
      setInput(c);
      return;
    }
    const r = sp.get("region"); // [#88] 지역 위젯 진입
    if (r) setInput(`${SITE}/region/${r}`);
  }, []);

  const target = useMemo(() => parseWidgetTarget(input), [input]);
  const code = target ? snippetFor(target, height) : "";

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), INLINE_CONFIRM_MS);
    } catch {
      // 클립보드 권한이 없는 브라우저 — 코드는 화면에 그대로 있으니 직접 복사하면 된다.
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card rounded-[16px] p-5">
        <label
          htmlFor="widget-complex-input"
          className="block text-[13px] font-extrabold text-ink"
        >
          1. 단지 또는 지역 주소 붙여넣기
        </label>
        <p className="mt-1 text-[12px] leading-[1.7] text-text-2">
          내집나우에서 단지 페이지(/complex/…) 또는 지역 페이지(/region/…)를 열고
          주소창의 주소를 그대로 붙여넣으세요. 지역 주소를 넣으면 중개사무소
          블로그용 지역 시세 요약 위젯이 만들어집니다.
        </p>
        <input
          id="widget-complex-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`${SITE}/complex/...`}
          spellCheck={false}
          className="mt-3 w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[13px] text-ink outline-none focus:border-primary"
        />
        {input.trim() !== "" && !target && (
          <p className="mt-2 text-[12px] font-bold text-danger">
            내집나우 주소가 아닙니다. /complex/ 또는 /region/ 이 들어간 주소를 붙여넣어
            주세요.
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <span className="text-[13px] font-extrabold text-ink">2. 높이</span>
          <div className="flex gap-1.5">
            {[220, 260, 300].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHeight(h)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${
                  height === h
                    ? "bg-primary text-white"
                    : "border border-line bg-surface text-text-1"
                }`}
              >
                {h}px
              </button>
            ))}
          </div>
          <span className="text-[11px] text-text-3">준공·세대수가 있으면 조금 더 길어집니다</span>
        </div>
      </div>

      <div className="card rounded-[16px] p-5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-extrabold text-ink">3. 코드 복사</span>
          <button
            type="button"
            onClick={copy}
            disabled={!code}
            className={`rounded-[10px] px-3 py-1.5 text-[12px] font-bold ${
              code ? "bg-primary text-white" : "bg-bg text-text-3"
            }`}
          >
            {copied ? "복사했습니다" : "복사"}
          </button>
        </div>
        <pre className="mt-2 overflow-x-auto rounded-[10px] bg-bg p-3 text-[11px] leading-[1.7] text-text-1">
          <code>{code || "위에 단지 주소를 넣으면 코드가 만들어집니다."}</code>
        </pre>
        <p className="mt-2 text-[11px] leading-[1.7] text-text-3">
          네이버 블로그·티스토리처럼 HTML 삽입을 지원하는 편집기라면 그대로 붙여넣으면
          됩니다. iframe 을 막는 서비스에서는 표시되지 않습니다.
        </p>
      </div>

      <div className="card rounded-[16px] p-5">
        <span className="text-[13px] font-extrabold text-ink">미리보기</span>
        {target ? (
          <iframe
            key={`${target.kind}-${target.id}-${height}`}
            src={`/embed/${target.kind}/${encodeURIComponent(target.id)}`}
            width="100%"
            height={height}
            style={{ border: 0, maxWidth: 400 }}
            loading="lazy"
            title="내집나우 실거래 시세 위젯 미리보기"
            className="mt-2 block"
          />
        ) : (
          <p className="mt-2 text-[12px] leading-[1.7] text-text-2">
            단지·지역 주소를 넣으면 실제 위젯이 그대로 나타납니다. 여기 보이는 화면이
            블로그에 붙는 화면과 같습니다.
          </p>
        )}
      </div>
    </div>
  );
}
