"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { useConfirm } from "@/components/app/confirm";
import { useDirtyGuard } from "@/components/app/dirty-guard";
import type { NavItem } from "@/components/app/navigation";

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const confirm = useConfirm();
  const guard = useDirtyGuard();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  async function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!guard?.isDirty()) {
      onNavigate?.();
      return;
    }
    event.preventDefault();
    const leave = await confirm({
      confirmLabel: "離開並放棄變更",
      consequence: "這一頁有還沒儲存的內容。離開後這些輸入不會保留，已經儲存過的資料不受影響。",
      danger: true,
      title: "要放棄未儲存的變更嗎？",
    });
    if (!leave) return;
    guard.markClean();
    onNavigate?.();
    router.push(item.href);
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
