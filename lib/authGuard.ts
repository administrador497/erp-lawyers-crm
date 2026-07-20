import { redirect } from "next/navigation";
import { getCurrentUsuario } from "@/lib/currentUser";
import type { CurrentUsuario } from "@/lib/types";

// Route protection used to live in middleware.ts, but the Next.js 14 Edge
// runtime it depends on hits "EvalError: Code generation from strings
// disallowed for this context" on some locked-down Windows dev machines.
// These checks now run as plain Server Component code inside each
// protected layout instead — no edge runtime involved.

// app/(app)/layout.tsx: wraps every authenticated screen (leads, dashboard,
// inbox, etc.). Bounces to /login if there's no session or the account is
// inactive, and to /change-password if the forced password change is
// pending.
export async function requireActiveSession(): Promise<CurrentUsuario> {
  const usuario = await getCurrentUsuario();

  if (!usuario) {
    redirect("/login");
  }
  if (!usuario.activo) {
    redirect("/login?error=cuenta_inactiva");
  }
  if (usuario.debe_cambiar_password) {
    redirect("/change-password");
  }

  return usuario;
}

// app/change-password/layout.tsx: only reachable while a password change is
// actually pending — otherwise send the user on to their normal landing
// screen so the temporary-password form can't be revisited afterwards.
export async function requireForcedPasswordChange(): Promise<CurrentUsuario> {
  const usuario = await getCurrentUsuario();

  if (!usuario) {
    redirect("/login");
  }
  if (!usuario.activo) {
    redirect("/login?error=cuenta_inactiva");
  }
  if (!usuario.debe_cambiar_password) {
    redirect("/leads");
  }

  return usuario;
}

// app/login/layout.tsx: an already-authenticated visitor shouldn't see the
// login form again — send them to whatever screen their session state
// actually calls for.
export async function redirectIfAlreadyAuthenticated(): Promise<void> {
  const usuario = await getCurrentUsuario();

  if (!usuario || !usuario.activo) {
    return;
  }
  if (usuario.debe_cambiar_password) {
    redirect("/change-password");
  }
  redirect("/leads");
}
