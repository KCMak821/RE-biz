"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { AppUser } from "@/lib/auth";

export type MemberRole = AppUser["organization"]["role"];

type Workspace = {
  canManageRecords: boolean;
  canManageSettings: boolean;
  currency: string;
  /**
   * Which features a platform admin currently allows. Used to hide what is
   * switched off; the API still enforces it, so this is UX only.
   */
  features: AppUser["features"];
  isOwner: boolean;
  organization: AppUser["organization"];
  /** True for the viewer role, which can read everything and change nothing. */
  readOnly: boolean;
  role: MemberRole;
  user: AppUser;
};

const WorkspaceContext = createContext<Workspace | null>(null);

/**
 * The signed-in user is resolved once, server-side, in the workspace layout and
 * handed down. Previously every screen re-derived permissions from raw role
 * strings inline, which is how “viewer” ended up hiding different buttons on
 * different pages.
 */
export function WorkspaceProvider({ children, user }: { children: ReactNode; user: AppUser }) {
  const value = useMemo<Workspace>(() => {
    const role = user.organization.role;
    return {
      canManageRecords: role !== "viewer",
      canManageSettings: role === "owner" || role === "admin",
      currency: user.organization.currency,
      features: user.features,
      isOwner: role === "owner",
      organization: user.organization,
      readOnly: role === "viewer",
      role,
      user,
    };
  }, [user]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("useWorkspace 必須在 WorkspaceProvider 內使用。");
  return workspace;
}
