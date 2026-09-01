"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";

import { useGuardedNavigation } from "@/components/app/dirty-guard";

/**
 * A drop-in `next/link` that asks before discarding unsaved input.
 *
 * Use this for every in-app link instead of `next/link` directly, so no single
 * link can quietly become the one route out of an editor that loses work.
 * External links and downloads still use a plain anchor.
 */
export function GuardedLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  const { guardedNavigate, isDirty } = useGuardedNavigation();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    // Modified clicks open a new tab or window, which never loses this page.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (!isDirty()) return;

    event.preventDefault();
    void guardedNavigate(String(props.href));
  }

  return <Link {...props} onClick={handleClick} />;
}
