import type { Metadata } from "next";
import { WelcomeClient } from "./WelcomeClient";

export const metadata: Metadata = {
  title: "시작하기 | 누구집",
  robots: { index: false, follow: false },
};

export default function WelcomePage() {
  return <WelcomeClient />;
}
