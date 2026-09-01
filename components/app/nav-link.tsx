"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

import { useGuardedNavigation } from "@/components/app/dirty-guard";
import type { NavItem } from "@/components/app/navigation";

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { guardedNavigate, isDirty } = useGuardedNavigation();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  async function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isDirty()) {
      onNavigate?.();
      return;
    }
    event.preventDefault();
    if (await guardedNavigate(item.href)) onNavigate?.();
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={active ? "nav-link is-active" : "nav-link"}
      href={item.href}
      onClick={(event) => void handleClick(event)}
    >
      <Icon aria-hidden="true" size={17} />
      <span>{item.label}</span>
      {item.external ? <em aria-hidden="true">↗</em> : null}
    </Link>
  );
}
