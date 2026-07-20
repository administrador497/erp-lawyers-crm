import { requireForcedPasswordChange } from "../../lib/authGuard";

export const dynamic = "force-dynamic";

export default async function ChangePasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireForcedPasswordChange();

  return <>{children}</>;
}
