"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PickedComplex } from "./ComplexPicker";

/* 허브 한 화면이 공유하는 "지금 고른 단지".
 *
 * 예전에는 검색기가 화면 중간 카드 안에 갇혀 있어서, 단지를 골라도 그 사실을
 * 아는 건 바로 옆 임장노트 카드 하나뿐이었다. 워크벤치 12장·지역 도구는 여전히
 * 빈손으로 열렸다(고른 단지를 다시 입력해야 했다).
 *
 * 선택을 화면 전체가 공유하면 히어로에서 한 번 고른 단지가 아래 카드 전부에
 * ?complexId= 로 실려 나간다 — 소유자 피드백 "인터랙티브하지 않다"의 실제 원인은
 * 애니메이션이 아니라 **내 입력이 화면에 아무 영향을 못 준다**는 쪽이었다.
 */

interface HubPickedValue {
  picked: PickedComplex | null;
  setPicked: (c: PickedComplex | null) => void;
  /** 고른 단지가 있으면 "?complexId=…", 없으면 빈 문자열 — 링크에 그대로 붙인다. */
  query: string;
}

const Ctx = createContext<HubPickedValue>({
  picked: null,
  setPicked: () => {},
  query: "",
});

export function HubPickedProvider({ children }: { children: ReactNode }) {
  const [picked, setPicked] = useState<PickedComplex | null>(null);
  const value = useMemo<HubPickedValue>(
    () => ({
      picked,
      setPicked,
      query: picked ? `?complexId=${encodeURIComponent(picked.id)}` : "",
    }),
    [picked],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHubPicked(): HubPickedValue {
  return useContext(Ctx);
}
