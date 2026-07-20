import AppShell from "@/components/AppShell";
import { initialsFromName } from "@/lib/currentUser";
import { requireActiveSession } from "@/lib/authGuard";

// cookies() already forces dynamic rendering in Next 14, but this is
// explicit and rules out any doubt that a cached render (with a stale or
// missing session) could ever be served here.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireActiveSession();

  return (
    <>
      <script
        // Avoids a flash of the wrong theme: applies the persisted preference
        // before the shell paints, instead of waiting for React to hydrate.
        dangerouslySetInnerHTML={{
          __html:
            "try{if(localStorage.getItem('crm-theme')==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}",
        }}
      />
      <AppShell
        currentUser={{
          nombre_completo: usuario.nombre_completo,
          rol: usuario.rol,
          initials: initialsFromName(usuario.nombre_completo),
        }}
      >
        {children}
      </AppShell>
    </>
  );
}
