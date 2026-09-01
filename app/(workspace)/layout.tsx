import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { ConfirmProvider } from "@/components/app/confirm";
import { DirtyGuardProvider } from "@/components/app/dirty-guard";
import { WorkspaceProvider } from "@/components/app/session";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The session is resolved once, on the server, for every signed-in page. The
 * old client-side gate meant a flash of the login card on every reload and made
 * “where am I” unanswerable, because everything lived at `/`.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    redirect("/login");
  }
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.organization.status === "suspended") redirect("/workspace-suspended");

  return (
    <WorkspaceProvider user={user}>
      <ConfirmProvider>
        <DirtyGuardProvider>
          <AppShell>{children}</AppShell>
        </DirtyGuardProvider>
      </ConfirmProvider>
    </WorkspaceProvider>
  );
}
