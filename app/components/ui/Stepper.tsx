/**
 * [961] 단계 진행 — 인터랙션 라이브러리 v2.0 §06.
 * 온점이 선을 타고 채워진다. 임장노트 작성·온보딩·회원가입 같은 다단계 흐름에.
 * `current` 는 0부터. 지난 단계의 선은 주홍으로 차고, 현재 점은 1.25배로 커진다.
 */
export function Stepper({
  count,
  current,
  className = "",
  label,
}: {
  count: number;
  current: number;
  className?: string;
  label?: string;
}) {
  const items = Array.from({ length: Math.max(1, count) }, (_, i) => i);
  return (
    <div className={`njn-stepper ${className}`} aria-label={label} role="img">
      {items.map((i) => (
        <span key={i} className="contents">
          <span className="sdot" data-on={i <= current ? "true" : "false"} />
          {i < items.length - 1 && (
            <span className="sline" data-on={i < current ? "true" : "false"}>
              <i />
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export default Stepper;
