"use client";

import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { Card, SummaryList } from "@/components/app/surfaces";
import { ChangePasswordForm } from "@/components/features/auth/change-password-form";
import { SignOutButton } from "@/components/features/auth/sign-out-button";
import { help } from "@/lib/help-content";
import { roleDescriptions, roleLabel } from "@/lib/status";

/**
 * Changing your own password used to be reachable only when an administrator
 * forced it on first sign-in. Now it has a home.
 */
export function AccountView() {
  const { organization, role, user } = useWorkspace();

  return (
    <div className="page">
      <PageHeader
        crumbs={[{ label: "設定" }, { label: "我的帳號" }]}
        description="你自己的登入資料。這裡的變更只影響你，不會影響其他成員。"
        how={help.account}
        title="我的帳號"
      />

      <div className="dash-grid">
        <Card description="至少 12 個字元，只有你知道。" title="變更密碼">
          <ChangePasswordForm currentLabel="目前的密碼" onDone="/settings/account" submitLabel="更新密碼" />
        </Card>

        <div className="dash-stack">
          <Card title="你的帳號">
            <SummaryList
              items={[
                { label: "姓名", value: user.name },
                { label: "登入 Email", value: user.email },
                { label: "所屬公司", value: organization.name },
                { label: "角色", value: roleLabel(role) },
              ]}
            />
            <p className="field-hint">{roleDescriptions[role]}</p>
          </Card>
          <Card description="離開這台裝置前記得登出。" title="登出">
            <SignOutButton label="從這台裝置登出" />
          </Card>
        </div>
      </div>
    </div>
  );
}
