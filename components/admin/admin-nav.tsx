"use client";

import { Activity, BarChart3, Building2, LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", icon: LayoutDashboard, label: "平台總覽" },
  { href: "/admin/workspaces", icon: Building2, label: "工作區" },
  { href: "/admin/users", icon: Users, label: "使用者" },
  { href: "/admin/usage", icon: BarChart3, label: "使用量" },
  { href: "/admin/audit-logs", icon: Activity, label: "操作紀錄" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav>
      <div className="nav-group">
        <p className="nav-group-label">平台管理</p>
        <ul>
          {items.map((item) => {
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? "nav-link is-active" : "nav-link"}
                  href={item.href}
                >
                  <Icon aria-hidden="true" size={17} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
