"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

type NavItem = {
  href: string;
  label: string;
  showBadge?: boolean;
};

// Solo texto visible — hrefs/keys se quedan igual que siempre para no tocar
// rutas ni nada que dependa de ellas.
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Panel General" },
  { href: "/leads", label: "Nuevos leads", showBadge: true },
  { href: "/inbox", label: "Bandeja de Entrada" },
  { href: "/contactos", label: "Contactos / Leads" },
  { href: "/pipeline", label: "Estado de los Leads" },
  { href: "/calendario", label: "Actividades Planificadas" },
  { href: "/formularios", label: "Formularios" },
  { href: "/reportes", label: "Reportes" },
  { href: "/usuarios", label: "Usuarios y roles" },
];

const VIEW_TITLES: Record<string, string> = {
  "/dashboard": "Panel General",
  "/leads": "Nuevos leads por asignar",
  "/inbox": "Bandeja de Entrada",
  "/contactos": "Contactos y leads",
  "/pipeline": "Estado de los Leads",
  "/calendario": "Actividades Planificadas",
  "/formularios": "Constructor de formularios",
  "/reportes": "Reportes",
  "/usuarios": "Usuarios y roles",
  "/perfil": "Mi perfil",
};

// Íconos de nav — trazo simple (currentColor), mismo patrón que el clip de
// adjuntos que ya existía en /inbox. Sin librería nueva.
function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

const NAV_ICON_SHAPES: Record<string, React.ReactNode> = {
  "/dashboard": (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  "/leads": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  "/inbox": (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),
  "/contactos": (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  "/pipeline": (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="5" height="10" rx="1" />
      <rect x="17" y="4" width="5" height="13" rx="1" />
    </>
  ),
  "/calendario": (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  "/formularios": (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1z" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  "/reportes": <path d="M18 20V10M12 20V4M6 20v-6" />,
  "/usuarios": (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
};

export type AppShellUser = {
  nombre_completo: string;
  rol: string | null;
  initials: string;
};

export default function AppShell({
  children,
  currentUser,
}: {
  children: React.ReactNode;
  currentUser: AppShellUser;
}) {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);
  const [todayLabel, setTodayLabel] = useState("");
  const [newLeadsCount, setNewLeadsCount] = useState<number | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("crm-theme");
    setDark(stored === "dark");
    setTodayLabel(
      new Date().toLocaleDateString("es-CR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadBadge = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/leads-inbox", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok || cancelled) return;
      const body = await res.json();
      if (!cancelled && Array.isArray(body.leads)) {
        setNewLeadsCount(body.leads.length);
      }
    };
    loadBadge();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    window.localStorage.setItem("crm-theme", next ? "dark" : "light");
  };

  const doLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Hard navigation for the same reason as the login/change-password
    // flows: guarantees the server sees the cleared session cookie on the
    // very next request instead of racing Next's client router cache.
    window.location.replace("/login");
  };

  const viewTitle = VIEW_TITLES[pathname] ?? "";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "236px 1fr", minHeight: "100vh" }}>
      <div
        style={{
          background: "var(--color-sidebar-bg)",
          padding: "18px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 6px 20px",
            borderBottom: "1px solid var(--color-tan)",
            marginBottom: 16,
          }}
        >
          <Image
            src="/logo-erp.png"
            alt="ERP Lawyers"
            width={34}
            height={34}
            style={{ width: 34, height: 34, objectFit: "contain" }}
          />
          <div
            style={{
              color: "#fff",
              fontFamily: "var(--font-heading)",
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            ERP Lawyers
            <br />
            <span style={{ color: "var(--color-cream)", fontWeight: 400, fontSize: 11 }}>
              CRM Omnicanal
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const badge = item.showBadge ? newLeadsCount : null;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "8px 12px 8px 9px",
                  borderRadius: "0 6px 6px 0",
                  borderLeft: active ? "3px solid var(--color-red)" : "3px solid transparent",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  // Acento a la izquierda en vez de pastilla sólida — el
                  // borde rojo funciona como marca de "activo" sin depender
                  // de que el texto rojo se note sobre el azul del sidebar
                  // (mismo problema de luminancia que antes: rojo y azul
                  // tienen contraste de matiz pero casi el mismo brillo).
                  // El texto activo pasa a blanco (no crema) para
                  // diferenciarse, con un fondo apenas más claro detrás.
                  color: active ? "#fff" : "var(--color-cream)",
                  background: active ? "rgba(255,255,255,0.1)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <NavIcon>{NAV_ICON_SHAPES[item.href]}</NavIcon>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                  </span>
                </span>
                {badge ? (
                  <span
                    style={{
                      background: "var(--color-red)",
                      color: "#fff",
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: "1px 7px",
                      borderRadius: 999,
                      flexShrink: 0,
                    }}
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div
          style={{
            marginTop: "auto",
            paddingTop: 16,
            borderTop: "1px solid var(--color-tan)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Link
            href="/perfil"
            title="Mi perfil"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flex: 1,
              minWidth: 0,
              textDecoration: "none",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "var(--color-red)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {currentUser.initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: "#fff",
                  fontSize: 12.5,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentUser.nombre_completo}
              </div>
              <div style={{ color: "var(--color-cream)", fontSize: 11 }}>{currentUser.rol}</div>
            </div>
          </Link>
          <div
            onClick={doLogout}
            title="Cerrar sesión"
            style={{ color: "var(--color-cream)", fontSize: 11, cursor: "pointer", flexShrink: 0 }}
          >
            Salir
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "13px 24px",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-panel)",
          }}
        >
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 17.5, fontWeight: 600 }}>
            {viewTitle}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              onClick={toggleDark}
              style={{
                fontSize: 12,
                color: "var(--color-muted)",
                cursor: "pointer",
                border: "1px solid var(--color-border)",
                padding: "5px 11px",
                borderRadius: 6,
              }}
            >
              {dark ? "☾ Modo oscuro" : "☀ Modo claro"}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{todayLabel}</div>
          </div>
        </div>

        <div style={{ flex: 1, padding: "22px 24px", overflow: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
