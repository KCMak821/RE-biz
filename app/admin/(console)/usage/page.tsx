import type { Metadata } from "next";
import Link from "next/link";

import { ListCard } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { listAdminWorkspaces } from "@/lib/platform-admin";
import { planLabel } from "@/lib/status";
import { allowanceState, plans } from "@/lib/subscription";

export const metadata: Metadata = { title: "使用量｜RE-Biz 平台管理" };

/** `null` allowances read as unlimited rather than as a missing number. */
function allowanceCell(used: number, allowance: number | null) {
  const state = allowanceState(used, allowance);
  if (state.allowance === null) return `${used.toLocaleString()} / 不限`;
  return `${used.toLocaleString()} / ${state.allowance.toLocaleString()}`;
}

export default async function UsagePage() {
  const rows = await listAdminWorkspaces();
  const over = rows.filter((workspace) => {
    const allowances = plans[workspace.subscription.planKey].allowances;
    return allowanceState(workspace.usage.thisMonth.receipts, allowances.receiptsPerMonth).over
      || allowanceState(workspace.usage.thisMonth.quotations, allowances.quotationsPerMonth).over
      || allowanceState(workspace.userCount, allowances.members).over;
  });

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[{ href: "/admin", label: "平台管理" }, { label: "使用量" }]}
        description="每個公司的本月用量對照方案額度，另附累計總量。超出額度只是標示出來，目前不會阻擋任何人使用。"
        title="使用量"
      />
      <ListCard
        footer={
          rows.length
            ? over.length
              ? `${over.length} 間公司本月已超出方案額度。目前沒有任何限制生效。`
              : "目前沒有公司超出方案額度。"
            : undefined
        }
      >
        {rows.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>公司</th>
                  <th>方案</th>
                  <th className="is-end">本月收據</th>
                  <th className="is-end">本月報價單</th>
                  <th className="is-end">目前成員</th>
                  <th className="is-end">累計收據</th>
                  <th className="is-end">累計收支</th>
                  <th className="is-end">累計報價單</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((workspace) => {
                  const allowances = plans[workspace.subscription.planKey].allowances;
                  return (
                    <tr key={workspace.id}>
                      <td>
                        <Link className="dtable-row-link" href={`/admin/workspaces/${workspace.id}`}>
                          {workspace.name}
                        </Link>
                      </td>
                      <td>{planLabel(workspace.subscription.planKey)}</td>
                      <td className="is-end">{allowanceCell(workspace.usage.thisMonth.receipts, allowances.receiptsPerMonth)}</td>
                      <td className="is-end">{allowanceCell(workspace.usage.thisMonth.quotations, allowances.quotationsPerMonth)}</td>
                      <td className="is-end">{allowanceCell(workspace.userCount, allowances.members)}</td>
                      <td className="is-end">{workspace.usage.receipts.toLocaleString()}</td>
                      <td className="is-end">{workspace.usage.accountingRecords.toLocaleString()}</td>
                      <td className="is-end">{workspace.usage.quotations.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="還沒有可以統計的公司">
            <p>建立第一間公司之後，使用量會自動出現在這裡。</p>
          </EmptyState>
        )}
      </ListCard>
    </div>
  );
}
