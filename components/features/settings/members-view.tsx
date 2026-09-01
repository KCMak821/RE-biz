"use client";

import { UserPlus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { Modal } from "@/components/app/dialog";
import { EmptyState } from "@/components/app/empty-state";
import { Callout, SkeletonRows } from "@/components/app/feedback";
import { Field, FormError, FormGrid, FormSection, SelectField } from "@/components/app/form";
import { ListCard } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { StatusBadge } from "@/components/app/status-badge";
import { notify } from "@/components/app/toast";
import { request } from "@/lib/api";
import { help } from "@/lib/help-content";
import { roleDescriptions, roleLabel } from "@/lib/status";
import type { Member } from "@/types/records";

export function MembersView() {
  const { canManageSettings, isOwner, organization, user } = useWorkspace();
  const confirm = useConfirm();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [inviting, setInviting] = useState(false);
  const [issued, setIssued] = useState<{ email: string; name: string; password: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void request<{ members?: Member[] }>("/api/members")
      .then((data) => {
        setMembers(data.members ?? []);
        setFailure("");
      })
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : "無法讀取成員資料。"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!canManageSettings) return;
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [canManageSettings, load]);

  async function changeStatus(member: Member) {
    const suspending = member.status === "active";
    if (suspending) {
      const proceed = await confirm({
        confirmLabel: "停權成員",
        consequence: `停權後，${member.name} 無法再使用 ${organization.name} 的工作區。他建立的資料與操作紀錄都會保留，之後可以隨時重新啟用。`,
        danger: true,
        title: `要停權 ${member.name} 嗎？`,
      });
      if (!proceed) return;
    }
    try {
      await request(`/api/members/${member.id}`, {
        body: JSON.stringify({ status: suspending ? "suspended" : "active" }),
        method: "PATCH",
      });
      notify.success(suspending ? `${member.name} 已停權` : `${member.name} 已重新啟用`);
      load();
    } catch (error) {
      notify.error("無法更新成員狀態", error instanceof Error ? error.message : undefined);
    }
  }

  if (!canManageSettings) {
    return (
      <div className="page">
        <PageHeader
          crumbs={[{ label: "設定" }, { label: "成員與權限" }]}
          description="新增同事帳號並設定他們可以做什麼。"
          title="成員與權限"
        />
        <Callout title="你沒有管理成員的權限" tone="warning">
          <p>只有工作區的擁有者與管理者可以新增或停權成員。</p>
        </Callout>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        crumbs={[{ label: "設定" }, { label: "成員與權限" }]}
        description={`${organization.name} 的成員清單。依同事的工作內容選擇最小必要的角色，不再需要使用時停權即可，資料都會保留。`}
        how={help.members}
        primaryAction={
          <Button icon={<UserPlus aria-hidden="true" size={16} />} onClick={() => setInviting(true)} variant="primary">
            新增成員
          </Button>
        }
        title="成員與權限"
      />

      {issued ? (
        <Callout title={`${issued.name} 的帳號已建立`} tone="success">
          <p>請用安全的方式把下面的暫用密碼交給他。他首次登入時系統會要求他設定自己的新密碼。</p>
          <div className="temp-password">
            <span>登入 Email：{issued.email}</span>
            <span>
              暫用密碼：<code>{issued.password}</code>
            </span>
          </div>
          <Button onClick={() => setIssued(null)} size="sm" variant="secondary">
            我已經交給他了，收起這則提示
          </Button>
        </Callout>
      ) : null}

      <ListCard footer="角色權限：擁有者與管理者可改設定與成員；操作員可處理日常資料；檢視者只能查看。">
        {loading ? (
          <SkeletonRows label="正在載入成員" rows={4} />
        ) : failure ? (
          <div style={{ padding: 20 }}>
            <Callout title="無法讀取成員資料" tone="warning">
              <p>{failure}</p>
              <Button onClick={load} size="sm" variant="secondary">
                再試一次
              </Button>
            </Callout>
          </div>
        ) : members.length ? (
          <ul className="member-list" style={{ padding: "6px 20px 14px" }}>
            {members.map((member) => {
              const canChange =
                member.id !== user.id && member.role !== "owner" && !(!isOwner && member.role === "admin");
              return (
                <li className="member-row" key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.email}</span>
                  </div>
                  <div className="member-row-end">
                    <span className="badge badge-neutral">{roleLabel(member.role)}</span>
                    <StatusBadge
                      domain="member"
                      value={
                        member.status === "suspended"
                          ? "suspended"
                          : member.mustChangePassword
                            ? "pending_password"
                            : "active"
                      }
                    />
                    {canChange ? (
                      <Button onClick={() => void changeStatus(member)} size="sm" variant="secondary">
                        {member.status === "active" ? "停權" : "重新啟用"}
                      </Button>
                    ) : (
                      <span className="field-hint">{member.id === user.id ? "這是你自己" : "不可變更"}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            actions={
              <Button icon={<UserPlus aria-hidden="true" size={16} />} onClick={() => setInviting(true)} variant="primary">
                新增第一位成員
              </Button>
            }
            icon={UsersRound}
            title="目前只有你一個人"
          >
            <p>新增成員之後，同事可以用自己的帳號登入，你也能依角色控制他們看得到什麼、改得了什麼。</p>
            <p>每位成員的收據、報價單與記帳資料各自獨立。</p>
          </EmptyState>
        )}
      </ListCard>

      <InviteMemberDialog
        allowAdmin={isOwner}
        onClose={() => setInviting(false)}
        onCreated={(created) => {
          setInviting(false);
          setIssued(created);
          load();
        }}
        open={inviting}
      />
    </div>
  );
}

function InviteMemberDialog({
  allowAdmin,
  onClose,
  onCreated,
  open,
}: {
  allowAdmin: boolean;
  onClose: () => void;
  onCreated: (created: { email: string; name: string; password: string }) => void;
  open: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "operator" | "viewer">("operator");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setEmail("");
    setRole("operator");
    setPassword("");
    setErrors({});
    setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "請輸入同事的姓名。";
    if (!email.trim()) found.email = "請輸入同事的公司 Email，他會用這個登入。";
    if (password.length < 12) found.password = "暫用密碼至少需要 12 個字元。";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    setMessage("");
    try {
      await request("/api/members", {
        body: JSON.stringify({ email: email.trim(), name: name.trim(), password, role }),
        method: "POST",
      });
      notify.success(`${name.trim()} 的帳號已建立`, "請安全地把暫用密碼交給他。");
      const created = { email: email.trim(), name: name.trim(), password };
      reset();
      onCreated(created);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法建立成員帳號，請稍後再試一次。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      description="建立後系統不會自動寄信，請你親自把暫用密碼交給對方。"
      footer={
        <>
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
            variant="ghost"
          >
            取消
          </Button>
          <Button form="member-form" pending={saving} pendingLabel="建立中…" type="submit" variant="primary">
            建立成員帳號
          </Button>
        </>
      }
      onClose={() => {
        reset();
        onClose();
      }}
      open={open}
      title="新增成員"
    >
      <form className="form" id="member-form" onSubmit={(event) => void submit(event)}>
        <FormSection title="成員資料">
          <FormGrid>
            <Field
              error={errors.name}
              label="姓名"
              onChange={(event) => setName(event.target.value)}
              placeholder="李小明"
              required
              value={name}
            />
            <Field
              error={errors.email}
              hint="他會用這個 Email 登入。"
              label="公司 Email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="colleague@company.com"
              required
              type="email"
              value={email}
            />
            <SelectField
              hint={roleDescriptions[role]}
              label="角色"
              onChange={(event) => setRole(event.target.value as "admin" | "operator" | "viewer")}
              required
              span
              value={role}
            >
              <option value="operator">操作員</option>
              <option value="viewer">檢視者</option>
              {allowAdmin ? <option value="admin">管理者</option> : null}
            </SelectField>
            <Field
              error={errors.password}
              hint="至少 12 個字元。對方首次登入時必須改成自己的密碼。"
              label="暫用密碼"
              onChange={(event) => setPassword(event.target.value)}
              required
              span
              type="password"
              value={password}
            />
          </FormGrid>
        </FormSection>
        <FormError>{message}</FormError>
      </form>
    </Modal>
  );
}
