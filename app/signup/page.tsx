import { SignupClient } from "./SignupClient";
import { getConfiguredSocialProviders } from "@/lib/auth/configured-social";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return <SignupClient social={getConfiguredSocialProviders()} />;
}
