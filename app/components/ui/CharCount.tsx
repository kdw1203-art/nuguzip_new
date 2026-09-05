"use client";

/* [966] 글자 수 카운터 — maxLength 가 걸린 textarea 아래에 "n / max".
   90% 부터 붉게 바뀐다. 스크린리더에는 그때부터만 알린다 — 매 글자마다 읽어 주면
   입력 자체가 소음이 된다. 라이브 영역은 처음부터 DOM 에 두고 내용만 채운다
   (aria-live 를 뒤늦게 켜면 켜지는 순간의 변화는 읽히지 않는다). */
export function CharCount({
  value,
  max,
  className = "",
}: {
  value: string;
  max: number;
  className?: string;
}) {
  const n = value.length;
  const near = n >= max * 0.9;
  return (
    <span
      className={`t-caption text-right tabular-nums ${near ? "text-brand-red" : "text-text-3"} ${className}`.trim()}
    >
      {n} / {max}
      <span className="sr-only" aria-live="polite">
        {near ? `${n} / ${max}` : ""}
      </span>
    </span>
  );
}

export default CharCount;
