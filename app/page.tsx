import { redirect } from "next/navigation";

// Has no dynamic API calls of its own, which makes it eligible for Next's
// build-time static optimization — but it isn't actually a static page: its
// destination depends on session state via app/(app)/layout.tsx one hop
// later. Forcing it dynamic also sidesteps a known Next 14.2.x App Router
// bug where statically prerendering a route backed only by the root layout
// (no nested layout) throws "<Html> should not be imported outside of
// pages/_document" / "Cannot read properties of null (reading 'useContext')"
// at build time — see app/not-found.tsx and app/global-error.tsx for the
// other two routes that hit the same bug.
export const dynamic = "force-dynamic";

export default function RootPage() {
  // No guard needed here: app/(app)/layout.tsx (via requireActiveSession)
  // re-checks auth / forced password change on every request to "/leads"
  // and redirects further if needed. This route just picks the landing
  // screen for an authenticated visit to "/".
  redirect("/leads");
}
