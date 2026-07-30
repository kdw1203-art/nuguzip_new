/**
 * Read-only: print the redirect_uri NextAuth sends to Google (no secrets).
 * Usage: node scripts/probe-google-oauth-redirect.mjs [origin]
 */
const origin = (process.argv[2] || "https://nuguzip.com").replace(/\/$/, "");

const csrfRes = await fetch(`${origin}/api/auth/csrf`, { cache: "no-store" });
const csrfJson = await csrfRes.json().catch(() => ({}));
const csrfToken = csrfJson?.csrfToken || "";
const cookies = csrfRes.headers.getSetCookie?.() || [];
const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");

const res = await fetch(`${origin}/api/auth/signin/google`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: cookieHeader,
  },
  body: new URLSearchParams({
    csrfToken,
    callbackUrl: `${origin}/login`,
    json: "true",
  }),
  redirect: "manual",
  cache: "no-store",
});

const location = res.headers.get("location") || "";
let redirectUri = "";
try {
  const u = new URL(location.startsWith("http") ? location : `${origin}${location}`);
  redirectUri = u.searchParams.get("redirect_uri") || "";
} catch {
  // ignore
}
const json = await res.json().catch(() => null);
if (!redirectUri && json?.url) {
  try {
    redirectUri = new URL(json.url).searchParams.get("redirect_uri") || "";
  } catch {
    // ignore
  }
}

console.log(
  JSON.stringify(
    {
      origin,
      status: res.status,
      redirectUri,
      expected: `${origin}/api/auth/callback/google`,
      match: redirectUri === `${origin}/api/auth/callback/google`,
    },
    null,
    2
  )
);
