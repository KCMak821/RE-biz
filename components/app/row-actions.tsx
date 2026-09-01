"use client";

import { Ellipsis } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { GuardedLink } from "@/components/app/guarded-link";

/**
 * Row-level actions: the one or two things people do most stay visible as words,
 * everything rarer (and everything destructive) goes behind 更多.
 */
export function RowActions({ children, menu }: { children?: ReactNode; menu?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="row-actions" ref={wrapper}>
      {children}
      {menu ? (
        <>
          <button
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="更多操作"
            className="row-more"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <Ellipsis aria-hidden="true" size={16} />
          </button>
          {open ? (
            <div className="row-menu" onClick={() => setOpen(false)} role="menu">
              {menu}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function MenuItem({
  children,
  danger,
  disabled,
  icon,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={danger ? "row-menu-item is-danger" : "row-menu-item"}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {icon}
      {children}
    </button>
  );
}

export function MenuLink({ children, href, icon }: { children: ReactNode; href: string; icon?: ReactNode }) {
  return (
    <GuardedLink className="row-menu-item" href={href} role="menuitem">
      {icon}
      {children}
    </GuardedLink>
  );
}
