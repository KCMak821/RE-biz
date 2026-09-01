"use client";

import { Archive, ArchiveRestore, Eye, Pencil, Plus, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button, ButtonLink } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { DataTable, ListCard, type Column } from "@/components/app/data-table";
import { EmptyState, FeatureDisabled, NoResults, ReadOnlyNotice } from "@/components/app/empty-state";
import { SkeletonRows } from "@/components/app/feedback";
import { ListToolbar, ToolbarSelect } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { MenuItem, MenuLink, RowActions } from "@/components/app/row-actions";
import { useWorkspace } from "@/components/app/session";
import { StatusBadge } from "@/components/app/status-badge";
import { notify } from "@/components/app/toast";
import { CustomerFormDialog } from "@/components/features/customers/customer-form-dialog";
import { ApiError, request } from "@/lib/api";
import { joinParts } from "@/lib/format";
import { help } from "@/lib/help-content";
import type { Customer } from "@/types/records";

export function CustomerList() {
  const { canManageRecords } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const load = useCallback(
    (status: string, search: string) => {
      const params = new URLSearchParams({ status });
      if (search.trim()) params.set("q", search.trim());
      setLoading(true);
      void request<{ customers?: Customer[] }>(`/api/customers?${params}`)
        .then((data) => {
          setCustomers(data.customers ?? []);
          setBlocked(null);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isForbidden) setBlocked(error.message);
          else notify.error("無法讀取客戶資料", error instanceof Error ? error.message : undefined);
        })
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => load(statusFilter, keyword), keyword ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [keyword, load, statusFilter]);

  function changeStatus(next: string) {
    setStatusFilter(next);
    const params = new URLSearchParams();
    if (next !== "active") params.set("status", next);
    router.replace(params.size ? `/customers?${params}` : "/customers", { scroll: false });
  }

  async function archive(customer: Customer) {
    const proceed = await confirm({
      confirmLabel: "封存客戶",
      consequence: `封存後，${customer.name} 不會再出現在新報價單與請款單的客戶選單。已開立的文件完全不受影響，之後也可以隨時重新啟用。`,
      title: `要封存 ${customer.name} 嗎？`,
    });
    if (!proceed) return;
    await updateStatus(customer, "archived", `${customer.name} 已封存`);
  }

  async function reactivate(customer: Customer) {
    await updateStatus(customer, "active", `${customer.name} 已重新啟用`);
  }

  async function updateStatus(customer: Customer, status: "active" | "archived", success: string) {
    try {
      await request(`/api/customers/${customer.id}`, { body: JSON.stringify({ status }), method: "PATCH" });
      notify.success(success, status === "archived" ? "可以在「已封存」篩選中找到。" : "現在可以在文件中選取。");
      load(statusFilter, keyword);
    } catch (error) {
      notify.error("無法更新客戶狀態", error instanceof Error ? error.message : undefined);
    }
  }

  const columns: Column<Customer>[] = [
    {
      card: "primary",
      cell: (customer) => (
        <>
          <strong>{customer.name}</strong>
          {customer.companyName && customer.companyName !== customer.name ? (
            <small>{customer.companyName}</small>
          ) : null}
        </>
      ),
      header: "客戶名稱",
      key: "name",
    },
    { card: "meta", cell: (customer) => customer.contact || "—", header: "聯絡人", key: "contact" },
    {
      card: "meta",
      cell: (customer) => joinParts([customer.phone, customer.email]) || "—",
      header: "聯絡方式",
      key: "reach",
    },
    {
      card: "status",
      cell: (customer) => <StatusBadge domain="customer" value={customer.status ?? "active"} />,
      header: "狀態",
      key: "status",
      width: "120px",
    },
  ];

  return (
    <div className="page">
      <PageHeader
        description="客戶資料建立一次，開立報價單與請款單時就能直接選取。已開立的文件會保留當時的客戶快照，之後修改不會改動舊文件。"
        how={help.customers}
        primaryAction={
          canManageRecords && !blocked ? (
            <Button
              icon={<Plus aria-hidden="true" size={16} />}
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
              variant="primary"
            >
              新增客戶
            </Button>
          ) : null
        }
        title="客戶"
      />

      {blocked ? (
        <ListCard>
          <FeatureDisabled feature="客戶主檔" message={blocked} />
        </ListCard>
      ) : (
        <>
          {!canManageRecords ? (
            <ReadOnlyNotice>你的角色可以查看客戶資料，但不能新增、修改或封存客戶。</ReadOnlyNotice>
          ) : null}

          <ListToolbar
            filters={
              <ToolbarSelect
                label="狀態"
                onChange={changeStatus}
                options={[
                  { label: "啟用中", value: "active" },
                  { label: "已封存", value: "archived" },
                  { label: "全部", value: "all" },
                ]}
                value={statusFilter}
              />
            }
            onReset={
              keyword || statusFilter !== "active"
                ? () => {
                    setKeyword("");
                    changeStatus("active");
                  }
                : undefined
            }
            onSearchChange={setKeyword}
            resultLabel={loading ? "載入中…" : `${customers.length} 位客戶`}
            searchPlaceholder="搜尋名稱、公司、聯絡人、電話或電郵"
            searchValue={keyword}
          />

          <ListCard>
            {loading ? (
              <SkeletonRows label="正在載入客戶資料" rows={6} />
            ) : customers.length ? (
              <DataTable
                ariaLabel="客戶列表"
                columns={columns}
                rowActions={(customer) => (
                  <RowActions
                    menu={
                      canManageRecords ? (
                        <>
                          <MenuLink href={`/customers/${customer.id}`} icon={<Eye aria-hidden="true" size={15} />}>
                            檢視客戶
                          </MenuLink>
                          <MenuItem
                            icon={<Pencil aria-hidden="true" size={15} />}
                            onClick={() => {
                              setEditing(customer);
                              setDialogOpen(true);
                            }}
                          >
                            編輯資料
                          </MenuItem>
                          {customer.status === "archived" ? (
                            <MenuItem
                              icon={<ArchiveRestore aria-hidden="true" size={15} />}
                              onClick={() => void reactivate(customer)}
                            >
                              重新啟用
                            </MenuItem>
                          ) : (
                            <MenuItem
                              danger
                              icon={<Archive aria-hidden="true" size={15} />}
                              onClick={() => void archive(customer)}
                            >
                              封存客戶
                            </MenuItem>
                          )}
                        </>
                      ) : (
                        <MenuLink href={`/customers/${customer.id}`} icon={<Eye aria-hidden="true" size={15} />}>
                          檢視客戶
                        </MenuLink>
                      )
                    }
                  >
                    <ButtonLink href={`/customers/${customer.id}`} size="sm" variant="secondary">
                      檢視
                    </ButtonLink>
                  </RowActions>
                )}
                rowHref={(customer) => `/customers/${customer.id}`}
                rowKey={(customer) => customer.id}
                rows={customers}
              />
            ) : keyword || statusFilter !== "active" ? (
              <NoResults
                onReset={() => {
                  setKeyword("");
                  changeStatus("active");
                }}
              />
            ) : (
              <EmptyState
                actions={
                  canManageRecords ? (
                    <Button
                      icon={<Plus aria-hidden="true" size={16} />}
                      onClick={() => {
                        setEditing(null);
                        setDialogOpen(true);
                      }}
                      variant="primary"
                    >
                      新增第一位客戶
                    </Button>
                  ) : null
                }
                icon={Users}
                title="還沒有建立任何客戶"
              >
                <p>建立客戶之後，開立報價單與請款單時可以直接選取，不用每次重打聯絡與開票資料。</p>
                <p>你也可以在建立報價單的過程中直接新增客戶。</p>
              </EmptyState>
            )}
          </ListCard>
        </>
      )}

      <CustomerFormDialog
        editing={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          load(statusFilter, keyword);
        }}
        open={dialogOpen}
      />
    </div>
  );
}
