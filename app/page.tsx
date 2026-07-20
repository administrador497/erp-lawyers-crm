import { redirect } from "next/navigation";

export default function RootPage() {
  // No guard needed here: app/(app)/layout.tsx (via requireActiveSession)
  // re-checks auth / forced password change on every request to "/leads"
  // and redirects further if needed. This route just picks the landing
  // screen for an authenticated visit to "/".
  redirect("/leads");
}
