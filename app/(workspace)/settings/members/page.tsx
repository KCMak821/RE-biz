import type { Metadata } from "next";

import { MembersView } from "@/components/features/settings/members-view";

export const metadata: Metadata = { title: "成員與權限｜RE-Biz" };

export default function MembersSettingsPage() {
  return <MembersView />;
}
