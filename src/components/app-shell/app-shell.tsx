"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

interface NavigationItem {
  href: string;
  label: string;
  icon: IconName;
  secondary?: boolean;
}

const navigation: NavigationItem[] = [
  { href: "/overview", label: "Overview", icon: "grid" },
  { href: "/inventory", label: "Inventory", icon: "box" },
  { href: "/agents", label: "Agents", icon: "agent" },
  { href: "/dashboards", label: "Dashboards", icon: "dashboard" },
  { href: "/knowledge", label: "Knowledge", icon: "search" },
  { href: "/processes", label: "Processes", icon: "process" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/memory", label: "Memory", icon: "memory", secondary: true },
];

const mobilePrimary = navigation.slice(0, 4);

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link className="brand" href="/overview" aria-label="Brain Dashboard overview">
      <span className="brand-mark"><Icon name="brain" size={22} /></span>
      <span className="brand-copy"><strong>Brain Dashboard</strong><small>Agent operations hub</small></span>
    </Link>
  );
}

function NavigationLink({ item, pathname, compact = false, onNavigate }: { item: NavigationItem; pathname: string; compact?: boolean; onNavigate?: () => void }) {
  const current = isCurrent(pathname, item.href);
  return (
    <Link className={`nav-link${current ? " active" : ""}${compact ? " compact" : ""}`} href={item.href} aria-label={item.label} aria-current={current ? "page" : undefined} onClick={onNavigate} title={item.label}>
      <Icon name={item.icon} size={20} /><span>{item.label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const current = navigation.find((item) => isCurrent(pathname, item.href));

  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [moreOpen]);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="desktop-sidebar" aria-label="Primary navigation">
        <Brand />
        <nav className="sidebar-nav">
          <div className="nav-group" aria-label="Workspace">
            {navigation.filter((item) => !item.secondary).map((item) => <NavigationLink item={item} pathname={pathname} key={item.href} />)}
          </div>
          <div className="nav-group secondary" aria-label="Data">
            <p className="nav-label">Data</p>
            {navigation.filter((item) => item.secondary).map((item) => <NavigationLink item={item} pathname={pathname} key={item.href} />)}
          </div>
        </nav>
        <div className="sidebar-footer"><span className="live-dot" />Connected workspace</div>
        <button className="nav-link sign-out-link" type="button" onClick={signOut} disabled={signingOut}>
          <Icon name="logout" size={20} /><span>{signingOut ? "Signing out…" : "Sign out"}</span>
        </button>
      </aside>

      <div className="app-column">
        <header className="topbar">
          <div className="mobile-brand"><Brand /></div>
          <div className="topbar-context"><span className="topbar-label">Workspace</span><strong>{current?.label ?? "Brain Dashboard"}</strong></div>
          <div className="freshness"><span className="live-dot" /><span>Live data</span></div>
        </header>
        <main id="main-content" className="content" tabIndex={-1}>{children}</main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        {mobilePrimary.map((item) => <NavigationLink item={item} pathname={pathname} compact key={item.href} />)}
        <button className={`nav-link compact${moreOpen ? " active" : ""}`} type="button" aria-expanded={moreOpen} aria-controls="mobile-more-menu" onClick={() => setMoreOpen((open) => !open)}>
          <Icon name="menu" size={20} /><span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="mobile-menu-layer" id="mobile-more-menu">
          <button className="menu-backdrop" type="button" aria-label="Close navigation menu" onClick={() => setMoreOpen(false)} />
          <section className="mobile-menu" aria-label="More navigation">
            <div className="mobile-menu-header"><div><p className="eyebrow">Navigate</p><h2>More</h2></div><button className="icon-button" type="button" aria-label="Close menu" onClick={() => setMoreOpen(false)}><Icon name="x" /></button></div>
            <nav>
              {navigation.slice(4).map((item) => <NavigationLink item={item} pathname={pathname} onNavigate={() => setMoreOpen(false)} key={item.href} />)}
              <button className="nav-link sign-out-link" type="button" onClick={signOut} disabled={signingOut}>
                <Icon name="logout" size={20} /><span>{signingOut ? "Signing out…" : "Sign out"}</span>
              </button>
            </nav>
          </section>
        </div>
      )}
    </div>
  );
}
