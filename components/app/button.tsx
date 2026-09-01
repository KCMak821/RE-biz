import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "md" | "sm";

function classes({
  block,
  className = "",
  size = "md",
  variant = "secondary",
}: {
  block?: boolean;
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : "", block ? "btn-block" : "", className]
    .filter(Boolean)
    .join(" ");
}

/**
 * Buttons always carry a word. Icon-only controls are reserved for repeated
 * row actions where the label would be noise, and those still get an aria-label.
 */
export function Button({
  block,
  children,
  className,
  icon,
  pending,
  pendingLabel,
  size,
  variant,
  ...props
}: ComponentProps<"button"> & {
  block?: boolean;
  icon?: ReactNode;
  /** Locks the button and swaps the label, so a slow save cannot be double-submitted. */
  pending?: boolean;
  pendingLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return (
    <button
      {...props}
      aria-busy={pending || undefined}
      className={classes({ block, className, size, variant })}
      disabled={props.disabled || pending}
      type={props.type ?? "button"}
    >
      {pending ? <span className="btn-spinner" aria-hidden="true" /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function ButtonLink({
  block,
  children,
  className,
  icon,
  size,
  variant,
  ...props
}: ComponentProps<typeof Link> & {
  block?: boolean;
  icon?: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return (
    <Link {...props} className={classes({ block, className, size, variant })}>
      {icon}
      {children}
    </Link>
  );
}
