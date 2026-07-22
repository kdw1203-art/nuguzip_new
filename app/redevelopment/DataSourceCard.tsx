import { Icon } from "@/app/components/Icon";

/**
 * 데이터 출처 카드 — jaegebal 벤치마크의 "데이터 출처" 표를 재현.
 * 데이터 종류 / 출처 / 업데이트 주기 3열 표. (RedevelopmentMap에서만 사용)
 */
export function DataSourceCard({
  sources,
}: {
  sources: { kind: string; source: string; cycle: string }[];
}) {
  return (
    <section className="card rounded-2xl px-5 py-4">
      <div className="flex items-center gap-1.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon name="file-text" size={14} />
        </span>
        <h2 className="text-sm font-extrabold text-ink">데이터 출처</h2>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-primary-soft text-[11px] font-bold text-primary">
              <th className="px-3 py-2 whitespace-nowrap">데이터 종류</th>
              <th className="px-3 py-2">출처</th>
              <th className="px-3 py-2 whitespace-nowrap">업데이트 주기</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s, i) => (
              <tr key={s.kind} className={i > 0 ? "border-t border-line" : ""}>
                <td className="whitespace-nowrap px-3 py-2 text-[12px] font-semibold text-ink">
                  {s.kind}
                </td>
                <td className="px-3 py-2 text-[12px] leading-[1.5] text-text-2">{s.source}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[12px] text-text-2">{s.cycle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] leading-[1.6] text-text-3">
        공개 자료를 취합·정리한 참고 정보예요. 원문·최신 고시는 각 출처에서 확인하세요.
      </p>
    </section>
  );
}
