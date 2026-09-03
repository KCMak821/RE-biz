"use client";

import { LogOut, Menu, X } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useGuardedNavigation } from "@/components/app/dirty-guard";
import { GuardedLink } from "@/components/app/guarded-link";
import { NavLink } from "@/components/app/nav-link";
import { navItemFor, visibleNavigation } from "@/components/app/navigation";
import { useWorkspace } from "@/components/app/session";
import { roleLabel } from "@/lib/status";

/**
 * Topbar, sidebar and mobile drawer for every signed-in page. The old shell put
 * a create action inside the sidebar and turned the whole nav into a horizontal
 * scroll strip on phones; here the sidebar is destinations only, and the phone
 * gets a drawer plus the name of the page you are on.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { canManageSettings, features, organization, role, user } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const { confirmDiscard } = useGuardedNavigation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const groups = visibleNavigation({ canManageSettings, features });
  const current = navItemFor(pathname);

  useEffect(() => {
    const dialog = drawer.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  useEffect(() => {
    const dialog = drawer.current;
    if (!dialog) return;
    const cancel = (event: Event) => {
      event.preventDefault();
      setDrawerOpen(false);
    };
    dialog.addEventListener("cancel", cancel);
    return () => dialog.removeEventListener("cancel", cancel);
  }, []);

  async function signOut() {
    // Signing out mid-edit throws work away just as surely as navigating away.
    if (!(await confirmDiscard())) return;
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const navTree = (onNavigate?: () => void) =>
    groups.map((group) => (
      <div className="nav-group" key={group.label}>
        <p className="nav-group-label">{group.label}</p>
        <ul>
          {group.items.map((item) => (
            <li key={item.href}>
              <NavLink item={item} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
    ));

  return (
    <div className="shell">
      <a className="skip-link no-print" href="#main">
        跳到主要內容
      </a>
      <header className="shell-topbar no-print">
        <button
          aria-label="開啟導覽選單"
          className="shell-menu"
          onClick={() => setDrawerOpen(true)}
          type="button"
        >
          <Menu aria-hidden="true" size={19} />
        </button>
        <GuardedLink className="brand" href="/dashboard">
          <Image alt="" className="brand-mark" height={30} priority src="/re-biz-mark.svg" width={30} />
          <span className="brand-name">RE-Biz</span>
        </GuardedLink>
        <span className="shell-current">{current?.label ?? ""}</span>
        <div className="shell-identity">
          <span className="shell-org" title="目前公司">
            {organization.name}
          </span>
          <span className="shell-user">
            {user.name}
            <em>{roleLabel(role)}</em>
          </span>
          <button
            className="shell-signout"
            disabled={signingOut}
            onClick={() => void signOut()}
            type="button"
          >
            <LogOut aria-hidden="true" size={14} />
            {signingOut ? "登出中…" : "登出"}
          </button>
        </div>
      </header>

      <div className="shell-body">
        <aside aria-label="主要導覽" className="shell-sidebar no-print">
          <nav>{navTree()}</nav>
        </aside>
        <main className="shell-main" id="main">
          {children}
        </main>
      </div>

      <dialog className="drawer no-print" ref={drawer}>
        <div className="drawer-inner">
          <header className="drawer-head">
            <span>導覽</span>
            <button aria-label="關閉導覽選單" onClick={() => setDrawerOpen(false)} type="button">
              <X aria-hidden="true" size={17} />
            </button>
          </header>
          <p className="drawer-org">
            {organization.name}
            <em>
              {user.name} · {roleLabel(role)}
            </em>
          </p>
          <nav>{navTree(() => setDrawerOpen(false))}</nav>
        </div>
      </dialog>
    </div>
  );
}
