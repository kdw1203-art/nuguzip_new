import type { Metadata } from "next";
import { LogoutClient } from "./LogoutClient";

export const metadata: Metadata = {
  title: "로그아웃 | 내집나우",
  robots: { index: false, follow: false },
};

/* [965] 로그아웃 화면. 예전엔 `/api/auth/signout` 으로 보냈고, 그건 Auth.js 의 영문
   기본 확인 화면("Are you sure you want to sign out?")이었다 — 브랜드도 한국어도
   없는 화면이다. 여기서는 마운트 즉시 signOut() 을 부르고 홈으로 돌아간다. */
export default function LogoutPage() {
  return <LogoutClient />;
}
