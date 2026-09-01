"use client";

import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { DataTable, ListCard, type Column } from "@/components/app/data-table";
import { Modal } from "@/components/app/dialog";
import { EmptyState, FeatureDisabled, NoResults, ReadOnlyNotice } from "@/components/app/empty-state";
import { SkeletonRows } from "@/components/app/feedback";
import {
  Field,
  FormError,
  FormGrid,
  FormSection,
  SelectField,
  TextareaField,
} from "@/components/app/form";
import { ListToolbar, ToolbarSelect } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { MenuItem, RowActions } from "@/components/app/row-actions";
import { useWorkspace } from "@/components/app/session";
import { StatusBadge } from "@/components/app/status-badge";
import { notify } from "@/components/app/toast";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, fallback } from "@/lib/format";
import { help } from "@/lib/help-content";
import type { Item } from "@/types/records";

/** The five fields `itemFieldsSchema` accepts. `id` must never be sent. */
type ItemFields = { description: string; isActive: boolean; name: string; sku: string; unitPrice: string };

const blankItemFields = (): ItemFields => ({
  description: "",
  isActive: true,
  name: "",
  sku: "",
  unitPrice: "",
});

export function ItemList() {
  const { canManageRecords, currency } = useWorkspace();
  const confirm = useConfirm();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void request<{ items?: Item[] }>("/api/items")
      .then((data) => {
        setItems(data.items ?? []);
        setBlocked(null);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.isForbidden) setBlocked(error.message);
        else notify.error("無法讀取商品與服務", error instanceof Error ? error.message : undefined);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const search = keyword.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter === "active" && !item.isActive) return false;
      if (statusFilter === "inactive" && item.isActive) return false;
      if (!search) return true;
      return [item.name, item.sku, item.description].join(" ").toLowerCase().includes(search);
    });
  }, [items, keyword, statusFilter]);

  async function remove(item: Item) {
    const proceed = await confirm({
      confirmLabel: "刪除品項",
      consequence: `刪除後，${item.name} 不會再出現在報價單的品項選單。已開立的報價單保留當時的品項內容，不受影響。如果只是暫時不賣，建議改成「已下架」而不是刪除。`,
      danger: true,
      title: `要刪除 ${item.name} 嗎？`,
    });
    if (!proceed) return;
    try {
      await request(`/api/items/${item.id}`, { method: "DELETE" });
      notify.success(`${item.name} 已刪除`);
      load();
    } catch (error) {
      notify.error("無法刪除品項", error instanceof Error ? error.message : undefined);
    }
  }

  const columns: Column<Item>[] = [
    {
      card: "primary",
      cell: (item) => (
        <>
          <strong>{item.name}</strong>
          {item.description ? <small>{item.description}</small> : null}
        </>
      ),
      header: "商品或服務",
      key: "name",
    },
    { card: "meta", cell: (item) => fallback(item.sku), header: "SKU／內部編號", key: "sku", width: "180px" },
    {
      align: "end",
      card: "amount",
      cell: (item) => <strong>{currencyAmount(currency, item.unitPrice)}</strong>,
      header: "預設單價",
      key: "price",
      width: "160px",
    },
    {
      card: "status",
      cell: (item) => <StatusBadge domain="item" value={item.isActive ? "active" : "inactive"} />,
      header: "狀態",
      key: "status",
      width: "120px",
    },
  ];

  return (
    <div className="page">
      <PageHeader
        description="把常賣的商品或服務連同預設單價存起來，開報價單時直接選取，不必每次重打。這裡不含庫存數量。"
        how={help.items}
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
              新增商品或服務
            </Button>
          ) : null
        }
        title="商品與服務"
      />

      {blocked ? (
        <ListCard>
          <FeatureDisabled feature="商品與服務" message={blocked} />
        </ListCard>
      ) : (
        <>
          {!canManageRecords ? (
            <ReadOnlyNotice>你的角色可以查看商品與服務，但不能新增或修改。</ReadOnlyNotice>
          ) : null}

          <ListToolbar
            filters={
              <ToolbarSelect
                label="狀態"
                onChange={setStatusFilter}
                options={[
                  { label: "全部", value: "all" },
                  { label: "啟用中", value: "active" },
                  { label: "已下架", value: "inactive" },
                ]}
                value={statusFilter}
              />
            }
            onReset={
              keyword || statusFilter !== "all"
                ? () => {
                    setKeyword("");
                    setStatusFilter("all");
                  }
                : undefined
            }
            onSearchChange={setKeyword}
            resultLabel={loading ? "載入中…" : `${filtered.length} 個品項`}
            searchPlaceholder="搜尋名稱、SKU 或說明"
            searchValue={keyword}
          />

          <ListCard>
            {loading ? (
              <SkeletonRows label="正在載入商品與服務" rows={5} />
            ) : filtered.length ? (
              <DataTable
                ariaLabel="商品與服務列表"
                columns={columns}
                rowActions={
                  canManageRecords
                    ? (item) => (
                        <RowActions
                          menu={
                            <MenuItem danger icon={<Trash2 aria-hidden="true" size={15} />} onClick={() => void remove(item)}>
                              刪除品項
                            </MenuItem>
                          }
                        >
                          <Button
                            icon={<Pencil aria-hidden="true" size={14} />}
                            onClick={() => {
                              setEditing(item);
                              setDialogOpen(true);
                            }}
                            size="sm"
                            variant="secondary"
                          >
                            編輯
                          </Button>
                        </RowActions>
                      )
                    : undefined
                }
                rowKey={(item) => item.id}
                rows={filtered}
              />
            ) : items.length ? (
              <NoResults
                onReset={() => {
                  setKeyword("");
                  setStatusFilter("all");
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
                      新增第一個商品或服務
                    </Button>
                  ) : null
                }
                icon={Package}
                title="還沒有建立任何商品或服務"
              >
                <p>把常賣的品項與預設單價存起來，開報價單時一鍵帶入名稱、說明與價格。</p>
                <p>沒有建立也可以照常開立報價單，只是每次都要手動輸入。</p>
              </EmptyState>
            )}
          </ListCard>
        </>
      )}

      <ItemFormDialog
        currency={currency}
        editing={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          load();
        }}
        open={dialogOpen}
      />
    </div>
  );
}

function ItemFormDialog({
  currency,
  editing,
  onClose,
  onSaved,
  open,
}: {
  currency: string;
  editing: Item | null;
  onClose: () => void;
  onSaved: () => void;
  open: boolean;
}) {
  const [fields, setFields] = useState<ItemFields>(blankItemFields);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setFields(
        editing
          ? {
              description: editing.description,
              isActive: editing.isActive,
              name: editing.name,
              sku: editing.sku,
              unitPrice: String(editing.unitPrice),
            }
          : blankItemFields(),
      );
      setErrors({});
      setMessage("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editing, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!fields.name.trim()) found.name = "請輸入商品或服務的名稱。";
    const price = Number(fields.unitPrice);
    if (!fields.unitPrice.trim()) found.unitPrice = "請輸入預設單價，沒有固定價格可以填 0。";
    else if (!Number.isFinite(price) || price < 0) found.unitPrice = "單價必須是 0 或以上的數字。";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    setMessage("");
    try {
      // The API validates strictly: only these five keys may be sent.
      await request(editing ? `/api/items/${editing.id}` : "/api/items", {
        body: JSON.stringify({
          description: fields.description,
          isActive: fields.isActive,
          name: fields.name,
          sku: fields.sku,
          unitPrice: price,
        }),
        method: editing ? "PUT" : "POST",
      });
      notify.success(
        editing ? `${fields.name} 已更新` : `已新增 ${fields.name}`,
        editing ? "已開立的報價單保留當時的內容。" : "開立報價單時可以在品項列直接選取。",
      );
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法儲存品項，請稍後再試一次。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      description="預設單價只在帶入報價單時使用，之後仍可在報價單上個別調整。"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button form="item-form" pending={saving} pendingLabel="儲存中…" type="submit" variant="primary">
            {editing ? "儲存變更" : "新增品項"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={editing ? `編輯 ${editing.name}` : "新增商品或服務"}
    >
      <form className="form" id="item-form" onSubmit={(event) => void submit(event)}>
        <FormSection title="品項內容">
          <FormGrid>
            <Field
              error={errors.name}
              label="名稱"
              onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
              placeholder="顧問服務（每小時）"
              required
              span
              value={fields.name}
            />
            <Field
              error={errors.unitPrice}
              inputMode="decimal"
              label={`預設單價（${currency}）`}
              min="0"
              onChange={(event) => setFields((current) => ({ ...current, unitPrice: event.target.value }))}
              placeholder="0.00"
              required
              step="0.01"
              type="number"
              value={fields.unitPrice}
            />
            <Field
              hint="給自己辨識用，不一定要填。"
              label="SKU／內部編號"
              onChange={(event) => setFields((current) => ({ ...current, sku: event.target.value }))}
              placeholder="SRV-001"
              value={fields.sku}
            />
            <SelectField
              hint="下架的品項不會出現在報價單選單，歷史文件不受影響。"
              label="狀態"
              onChange={(event) => setFields((current) => ({ ...current, isActive: event.target.value === "true" }))}
              span
              value={String(fields.isActive)}
            >
              <option value="true">啟用中（可在報價單選取）</option>
              <option value="false">已下架（不出現在選單）</option>
            </SelectField>
            <TextareaField
              hint="會一起帶入報價單的品項說明欄。"
              label="說明"
              onChange={(event) => setFields((current) => ({ ...current, description: event.target.value }))}
              placeholder="包含前期訪談與書面建議"
              rows={2}
              span
              value={fields.description}
            />
          </FormGrid>
        </FormSection>
        <FormError>{message}</FormError>
      </form>
    </Modal>
  );
}
