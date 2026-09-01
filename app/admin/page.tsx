import type { Metadata } from "next";

import { ButtonLink } from "@/components/app/button";
import { PageHeader } from "@/components/app/page-header";
import { Stat, Stats } from "@/components/app/surfaces";
import { getPlatformOverview } from "@/lib/platform-admin";

export const metadata: Metadata = { title: "平台總覽｜RE-Biz 平台管理" };

const cards = [
  { hint: "目前可正常使用的工作區", key: "activeWorkspaces", label: "啟用中的工作區" },
  { hint: "含已暫停的工作區", key: "totalWorkspaces", label: "工作區總數" },
  { hint: "所有工作區的成員帳號", key: "totalUsers", label: "使用者總數" },
  { hint: "所有工作區累計", key: "totalReceipts", label: "收據總數" },
  { hint: "所有工作區累計", key: "totalAccountingRecords", label: "收支紀錄總數" },
  { hint: "所有工作區累計", key: "totalQuotations", label: "報價單總數" },
] as const;

export default async function AdminOverviewPage() {
  const overview = await getPlatformOverview();

  return (
    <div className="page">
      <PageHeader
        description="全平台的工作區、帳號與資料量概況。要暫停工作區或開關個別功能，請從「工作區」進入詳情頁。"
        primaryAction={
          <ButtonLink href="/admin/workspaces" variant="primary">
            管理工作區
          </ButtonLink>
        }
        title="平台總覽"
      />
      <Stats>
        {cards.map((card) => (
          <Stat
            hint={card.hint}
            key={card.key}
            label={card.label}
            value={(overview[card.key] ?? 0).toLocaleString()}
          />
        ))}
      </Stats>
    </div>
  );
}
