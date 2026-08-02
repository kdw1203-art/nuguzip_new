import { SignupClient } from "./SignupClient";
import { getConfiguredSocialProviders } from "@/lib/auth/configured-social";

export const dynamic = "force-dynamic";

/* 항목 46b — 가입 화면도 개별 제목 + noindex. */
export const metadata = {
  title: "회원가입 | 누구집",
  robots: { index: false, follow: true },
};

export default function SignupPage() {
  return <SignupClient social={getConfiguredSocialProviders()} />;
}
