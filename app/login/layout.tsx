import { redirectIfAlreadyAuthenticated } from "@/lib/authGuard";

export const dynamic = "force-dynamic";

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  await redirectIfAlreadyAuthenticated();

  return <>{children}</>;
}
