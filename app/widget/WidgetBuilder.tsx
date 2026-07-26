"use client";

import { useEffect, useMemo, useState } from "react";

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

/** 붙여넣은 문자열에서 단지 id 를 뽑는다. URL 이든 id 자체든 받는다. */
export function parseComplexId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // 1) 누구집 단지 URL — /complex/{id} · /embed/complex/{id} (쿼리·해시 무시)
  const m = raw.match(/\/(?:embed\/)?complex\/([^/?#\s]+)/);
  if (m && m[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }

  // 2) 다른 사이트 URL 을 붙여넣은 경우 — id 로 오인하지 않는다.
  if (/^https?:\/\//i.test(raw) || raw.includes("/")) return null;

  // 3) id 를 그대로 붙여넣은 경우
  return raw;
}

function snippetFor(id: string, height: number): string {
  const src = `${SITE}/embed/complex/${encodeURIComponent(id)}`;
  return `<iframe src="${src}" width="100%" height="${height}" style="border:0;max-width:400px" loading="lazy" title="누구집 실거래 시세 위젯"></iframe>`;
}

export function WidgetBuilder() {
  const [input, setInput] = useState("");
  const [height, setHeight] = useState(260);
  const [copied, setCopied] = useState(false);

  // /complex/{id} 에서 "위젯으로 퍼가기"로 넘어온 경우 자동 채움.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("complex");
    if (q) setInput(q);
  }, []);

  const id = useMemo(() => parseComplexId(input), [input]);
  const code = id ? snippetFor(id, height) : "";

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
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
          1. 단지 주소 붙여넣기
        </label>
        <p className="mt-1 text-[12px] leading-[1.7] text-text-2">
          누구집에서 단지 페이지를 열고 주소창의 주소를 그대로 붙여넣으세요.
          (예: {SITE}/complex/…)
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
        {input.trim() !== "" && !id && (
          <p className="mt-2 text-[12px] font-bold text-danger">
            누구집 단지 주소가 아닙니다. /complex/ 가 들어간 주소를 붙여넣어 주세요.
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
        {id ? (
          <iframe
            key={`${id}-${height}`}
            src={`/embed/complex/${encodeURIComponent(id)}`}
            width="100%"
            height={height}
            style={{ border: 0, maxWidth: 400 }}
            loading="lazy"
            title="누구집 실거래 시세 위젯 미리보기"
            className="mt-2 block"
          />
        ) : (
          <p className="mt-2 text-[12px] leading-[1.7] text-text-2">
            단지 주소를 넣으면 실제 위젯이 그대로 나타납니다. 여기 보이는 화면이 블로그에
            붙는 화면과 같습니다.
          </p>
        )}
      </div>
    </div>
  );
}
