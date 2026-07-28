"use client";

import { useEffect, useRef } from "react";
import { useMoment } from "@/app/components/motion/MomentProvider";

/**
 * 결제 결과 화면에 도착한 순간의 축하 장면.
 *
 * 결과 페이지는 서버 컴포넌트라 훅을 쓸 수 없어서, 판정된 status 만 받아
 * 연출을 재생하는 얇은 클라이언트 자식으로 분리했다.
 *
 * **`status === "ok"` 일 때만** 재생한다. "mock"(웹훅 반영 대기·테스트 모드)과
 * "error" 는 결제가 끝났다고 말할 수 없는 상태다 — 이 두 경우까지 축하 장면을
 * 띄우면 화면의 문구는 "확인 중"인데 연출은 "완료"라고 말하게 된다.
 * 그건 연출이 아니라 잘못된 정보다.
 */
export function PaymentSuccessMoment({ status }: { status: "ok" | "mock" | "error" }) {
  const { showMoment } = useMoment();
  /* 한 번만. StrictMode 개발 모드에서는 이펙트가 두 번 도는데, 그때 장면이
     두 번 재생되면 첫 번째가 중간에 끊긴 것처럼 보인다. */
  const played = useRef(false);

  useEffect(() => {
    if (status !== "ok" || played.current) return;
    played.current = true;
    showMoment({
      title: "결제가 완료됐어요",
      subtitle: "구독 플랜이 계정에 적용됐습니다",
      kind: "celebrate",
    });
  }, [status, showMoment]);

  return null;
}

export default PaymentSuccessMoment;
