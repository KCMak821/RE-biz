import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The entry point only decides where you belong. Every screen now has its own
 * address, so `/` never renders an app of its own.
 */
export default async function RootPage() {
  const user = await getCurrentUser().catch(() => null);
  redirect(user ? "/dashboard" : "/login");
}
