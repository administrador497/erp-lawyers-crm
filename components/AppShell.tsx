"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NavItem = {
  href: string;
  label: string;
  showBadge?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Panel General" },
  { href: "/leads", label: "Nuevos leads", showBadge: true },
  { href: "/inbox", label: "Bandeja omnicanal" },
  { href: "/contactos", label: "Contactos / Leads" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/calendario", label: "Calendario y actividades" },
  { href: "/formularios", label: "Formularios" },
  { href: "/reportes", label: "Reportes" },
  { href: "/usuarios", label: "Usuarios y roles" },
];

const VIEW_TITLES: Record<string, string> = {
  "/dashboard": "Panel General",
  "/leads": "Nuevos leads por asignar",
  "/inbox": "Bandeja omnicanal",
  "/contactos": "Contactos y leads",
  "/pipeline": "Pipeline de oportunidades",
  "/calendario": "Calendario y actividades",
  "/formularios": "Constructor de formularios",
  "/reportes": "Reportes",
  "/usuarios": "Usuarios y roles",
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
          padding: "22px 16px",
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

        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const badge = item.showBadge ? newLeadsCount : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "10px 12px",
                borderRadius: 2,
                fontSize: 13.5,
                fontWeight: 500,
                cursor: "pointer",
                // Active pill is white-on-blue (not red-on-blue): red and
                // blue read as very different hues but have almost the
                // same luminance, so a red pill barely registers as a
                // distinct shape against the new blue sidebar. White gives
                // the pill a real boundary; red text keeps "active" tied to
                // the same red-means-primary language used everywhere else
                // (buttons, badges, priority).
                color: active ? "var(--color-red)" : "var(--color-cream)",
                background: active ? "#fff" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>{item.label}</span>
              {badge ? (
                <span
                  style={{
                    background: "var(--color-red)",
                    color: "#fff",
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "1px 7px",
                    borderRadius: 10,
                  }}
                >
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}

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
          <div
            onClick={doLogout}
            title="Cerrar sesión"
            style={{ color: "var(--color-cream)", fontSize: 11, cursor: "pointer" }}
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
            padding: "16px 28px",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-panel)",
          }}
        >
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 19, fontWeight: 600 }}>
            {viewTitle}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              onClick={toggleDark}
              style={{
                fontSize: 12.5,
                color: "var(--color-muted)",
                cursor: "pointer",
                border: "1px solid var(--color-border)",
                padding: "6px 12px",
                borderRadius: 2,
              }}
            >
              {dark ? "☾ Modo oscuro" : "☀ Modo claro"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-muted)" }}>{todayLabel}</div>
          </div>
        </div>

        <div style={{ flex: 1, padding: "26px 28px", overflow: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
