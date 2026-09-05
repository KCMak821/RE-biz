"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { Field } from "@/components/app/form";
import { notify } from "@/components/app/toast";
import { request } from "@/lib/api";
import { formatPlanPrice, type Plan } from "@/lib/plan-types";
import { featureLabel } from "@/lib/status";
import { workspaceFeatureKeys, type WorkspaceFeatureKey } from "@/lib/workspace-feature-keys";

type Draft = {
  currency: string;
  description: string;
  features: WorkspaceFeatureKey[];
  isDefault: boolean;
  label: string;
  members: string;
  price: string;
  quotationsPerMonth: string;
  receiptsPerMonth: string;
  sortOrder: string;
  stripePriceId: string;
};

/** An empty allowance box means "no ceiling"; a number is a ceiling. */
function toAllowance(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function fromAllowance(value: number | null) {
  return value === null ? "" : String(value);
}

/** Prices are entered in dollars and stored in minor units. */
function toCents(value: string) {
  const parsed = Number(value.trim() || "0");
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
}

function draftFrom(plan: Plan): Draft {
  return {
    currency: plan.currency,
    description: plan.description,
    features: [...plan.features],
    isDefault: plan.isDefault,
    label: plan.label,
    members: fromAllowance(plan.allowances.members),
    price: plan.priceCents ? String(plan.priceCents / 100) : "",
    quotationsPerMonth: fromAllowance(plan.allowances.quotationsPerMonth),
    receiptsPerMonth: fromAllowance(plan.allowances.receiptsPerMonth),
    sortOrder: String(plan.sortOrder),
    stripePriceId: plan.stripePriceId ?? "",
  };
}

function payloadFrom(draft: Draft) {
  return {
    allowances: {
      members: toAllowance(draft.members),
      quotationsPerMonth: toAllowance(draft.quotationsPerMonth),
      receiptsPerMonth: toAllowance(draft.receiptsPerMonth),
    },
    currency: draft.currency.trim().toUpperCase() || "HKD",
    description: draft.description.trim(),
    features: draft.features,
    isDefault: draft.isDefault,
    label: draft.label.trim(),
    priceCents: toCents(draft.price),
    sortOrder: Number(draft.sortOrder.trim() || "0"),
    stripePriceId: draft.stripePriceId.trim(),
  };
}

function PlanFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  function toggleFeature(key: WorkspaceFeatureKey) {
    onChange({
      ...draft,
      features: draft.features.includes(key)
        ? draft.features.filter((feature) => feature !== key)
        : [...draft.features, key],
    });
  }

  return (
    <>
      <Field
        label="方案名稱"
        onChange={(event) => onChange({ ...draft, label: event.target.value })}
        required
        value={draft.label}
      />
      <Field
        hint="給自己看的說明，也會出現在指派方案的畫面。"
        label="說明"
        onChange={(event) => onChange({ ...draft, description: event.target.value })}
        value={draft.description}
      />
      <Field
        hint="每間公司每月的價格。留空或 0 表示免費。"
        label={`月費（${draft.currency || "HKD"}）`}
        inputMode="decimal"
        onChange={(event) => onChange({ ...draft, price: event.target.value })}
        placeholder="0"
        value={draft.price}
      />
      <Field
        hint="留空表示不限量。"
        label="每月收據額度"
        inputMode="numeric"
        onChange={(event) => onChange({ ...draft, receiptsPerMonth: event.target.value })}
        placeholder="不限"
        value={draft.receiptsPerMonth}
      />
      <Field
        hint="留空表示不限量。"
        label="每月報價單額度"
        inputMode="numeric"
        onChange={(event) => onChange({ ...draft, quotationsPerMonth: event.target.value })}
        placeholder="不限"
        value={draft.quotationsPerMonth}
      />
      <Field
        hint="留空表示不限人數。"
        label="成員上限"
        inputMode="numeric"
        onChange={(event) => onChange({ ...draft, members: event.target.value })}
        placeholder="不限"
        value={draft.members}
      />

      <Field
        hint="在 Stripe 建立 Price 之後貼進來，Webhook 會靠它判斷客戶訂的是哪個方案。留空表示尚未對應。"
        label="Stripe Price ID"
        onChange={(event) => onChange({ ...draft, stripePriceId: event.target.value })}
        placeholder="price_..."
        value={draft.stripePriceId}
      />

      <fieldset className="admin-feature-list" style={{ border: 0, margin: "10px 0", padding: 0 }}>
        <legend className="card-title" style={{ fontSize: 15, marginBottom: 8 }}>
          方案包含的功能
        </legend>
        {workspaceFeatureKeys.map((key) => (
          <label className="admin-feature-row" key={key} style={{ cursor: "pointer" }}>
            <input
              checked={draft.features.includes(key)}
              onChange={() => toggleFeature(key)}
              type="checkbox"
            />
            <div>
              <strong>{featureLabel(key)}</strong>
              <span>列在這個方案裡。公司換到這個方案時，功能開關會照這裡重設；之後仍可為個別公司單獨調整。</span>
            </div>
          </label>
        ))}
      </fieldset>

      <label className="admin-feature-row" style={{ cursor: "pointer" }}>
        <input
          checked={draft.isDefault}
          onChange={(event) => onChange({ ...draft, isDefault: event.target.checked })}
          type="checkbox"
        />
        <div>
          <strong>設為預設方案</strong>
          <span>新註冊的公司會落在這個方案。平台必須固定有一個預設方案。</span>
        </div>
      </label>
    </>
  );
}

export function PlanEditor({ plan, workspaceCount }: { plan: Plan; workspaceCount: number }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(plan));
  const [pending, setPending] = useState(false);

  async function save() {
    const next = payloadFrom(draft);
    if (next.priceCents !== plan.priceCents && workspaceCount > 0) {
      const proceed = await confirm({
        confirmLabel: "更新方案",
        consequence:
          `目前有 ${workspaceCount} 間公司在「${plan.label}」。` +
          `調價後，這些公司記錄的價格維持在原本的金額不變，只有之後新指派這個方案的公司會用新價格。` +
          "要讓既有公司跟著調價，需要逐一重新指派方案。",
        title: `要把「${plan.label}」的月費改成 ${formatPlanPrice(next.priceCents, next.currency)} 嗎？`,
      });
      if (!proceed) return;
    }

    setPending(true);
    try {
      await request(`/api/admin/plans/${plan.key}`, { body: JSON.stringify(next), method: "PATCH" });
      notify.success(`方案「${next.label}」已更新`);
      setOpen(false);
      router.refresh();
    } catch (error) {
      notify.error("無法更新方案", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(false);
    }
  }

  async function setArchived(archived: boolean) {
    if (archived) {
      const proceed = await confirm({
        confirmLabel: "封存方案",
        consequence:
          `「${plan.label}」不會再出現在指派方案的選單裡。` +
          (workspaceCount > 0
            ? `目前在這個方案的 ${workspaceCount} 間公司完全不受影響，會繼續留在原方案。`
            : "目前沒有公司在這個方案。") +
          "方案不會被刪除，之後可以隨時還原。",
        danger: true,
        title: `要封存「${plan.label}」嗎？`,
      });
      if (!proceed) return;
    }
    setPending(true);
    try {
      await request(`/api/admin/plans/${plan.key}`, { body: JSON.stringify({ archived }), method: "PATCH" });
      notify.success(archived ? `「${plan.label}」已封存` : `「${plan.label}」已還原`);
      router.refresh();
    } catch (error) {
      notify.error("無法變更方案狀態", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen((value) => !value)} size="sm" variant="secondary">
        {open ? "收起" : "編輯"}
      </Button>{" "}
      <Button
        disabled={plan.isDefault && !plan.archived}
        onClick={() => void setArchived(!plan.archived)}
        pending={pending}
        pendingLabel="處理中…"
        size="sm"
        variant={plan.archived ? "primary" : "secondary"}
      >
        {plan.archived ? "還原" : "封存"}
      </Button>
      {open ? (
        <div className="admin-feature-list" style={{ marginTop: 12 }}>
          <PlanFields draft={draft} onChange={setDraft} />
          <div>
            <Button onClick={() => void save()} pending={pending} pendingLabel="儲存中…" size="sm" variant="primary">
              儲存方案
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

const blankDraft: Draft = {
  currency: "HKD",
  description: "",
  features: ["receipts"],
  isDefault: false,
  label: "",
  members: "",
  price: "",
  quotationsPerMonth: "",
  receiptsPerMonth: "",
  sortOrder: "50",
  stripePriceId: "",
};

export function NewPlanForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    try {
      await request("/api/admin/plans", {
        body: JSON.stringify({ ...payloadFrom(draft), key: key.trim().toLowerCase() }),
        method: "POST",
      });
      notify.success(`方案「${draft.label}」已建立`);
      setOpen(false);
      setKey("");
      setDraft(blankDraft);
      router.refresh();
    } catch (error) {
      notify.error("無法建立方案", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" variant="primary">
        新增方案
      </Button>
    );
  }

  return (
    <div className="admin-feature-list">
      <Field
        hint="建立後不能更改，會出現在網址與紀錄裡。只能用小寫英文、數字與連字號，例如 team-plus。"
        label="方案代碼"
        onChange={(event) => setKey(event.target.value)}
        placeholder="team-plus"
        required
        value={key}
      />
      <PlanFields draft={draft} onChange={setDraft} />
      <div>
        <Button
          disabled={!key.trim() || !draft.label.trim()}
          onClick={() => void create()}
          pending={pending}
          pendingLabel="建立中…"
          size="sm"
          variant="primary"
        >
          建立方案
        </Button>{" "}
        <Button onClick={() => setOpen(false)} size="sm" variant="secondary">
          取消
        </Button>
      </div>
    </div>
  );
}
