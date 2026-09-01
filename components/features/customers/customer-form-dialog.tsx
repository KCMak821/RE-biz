"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { Modal } from "@/components/app/dialog";
import {
  Disclosure,
  Field,
  FormError,
  FormGrid,
  FormSection,
  TextareaField,
} from "@/components/app/form";
import { notify } from "@/components/app/toast";
import { blankCustomerFields, customerFields, type CustomerFields } from "@/components/features/customers/customer-fields";
import { request } from "@/lib/api";
import type { Customer } from "@/types/records";

/**
 * One dialog for both creating and editing, with the title saying which. The old
 * screen kept an always-open form above the list whose only clue about the mode
 * was the word on the submit button.
 */
export function CustomerFormDialog({
  editing,
  onClose,
  onSaved,
  open,
}: {
  editing: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
  open: boolean;
}) {
  const [fields, setFields] = useState<CustomerFields>(blankCustomerFields);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setFields(editing ? customerFields(editing) : blankCustomerFields());
      setErrors({});
      setMessage("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editing, open]);

  function update(field: keyof CustomerFields, value: string) {
    setErrors((current) => ({ ...current, [field]: "" }));
    setFields((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!fields.name.trim()) found.name = "請輸入客戶名稱，這是文件上會顯示的名稱。";
    if (fields.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim()))
      found.email = "電郵格式看起來不正確，例如：someone@company.com。";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    setMessage("");
    try {
      const data = await request<{ customer: Customer }>(
        editing ? `/api/customers/${editing.id}` : "/api/customers",
        { body: JSON.stringify(fields), method: editing ? "PUT" : "POST" },
      );
      notify.success(
        editing ? `${data.customer.name} 已更新` : `客戶 ${data.customer.name} 已新增`,
        editing ? "已開立的文件仍保留當時的客戶快照。" : "開立報價單或請款單時就可以直接選取。",
      );
      onSaved(data.customer);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法儲存客戶資料，請稍後再試一次。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      description={
        editing
          ? "修改後，之後開立的新文件會使用新資料；已開立的文件保留當時的快照。"
          : "只有客戶名稱是必填，其他資料可以之後再補。"
      }
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button
            form="customer-form"
            pending={saving}
            pendingLabel="儲存中…"
            type="submit"
            variant="primary"
          >
            {editing ? "儲存變更" : "新增客戶"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={editing ? `編輯 ${editing.name}` : "新增客戶"}
      wide
    >
      <form className="form" id="customer-form" onSubmit={(event) => void submit(event)}>
        <FormSection title="基本資料">
          <FormGrid>
            <Field
              error={errors.name}
              hint="文件上顯示的名稱，可以是公司或個人。"
              label="客戶名稱"
              onChange={(event) => update("name", event.target.value)}
              placeholder="ABC Trading"
              required
              value={fields.name}
            />
            <Field
              hint="與客戶名稱不同時填寫，例如正式登記名稱。"
              label="公司全名"
              onChange={(event) => update("companyName", event.target.value)}
              placeholder="ABC Trading Company Limited"
              value={fields.companyName}
            />
            <Field
              label="聯絡人"
              onChange={(event) => update("contact", event.target.value)}
              placeholder="陳先生"
              value={fields.contact}
            />
            <Field
              label="電話"
              onChange={(event) => update("phone", event.target.value)}
              placeholder="+852 1234 5678"
              value={fields.phone}
            />
            <Field
              error={errors.email}
              label="電郵"
              onChange={(event) => update("email", event.target.value)}
              placeholder="contact@company.com"
              span
              type="email"
              value={fields.email}
            />
          </FormGrid>

          <Disclosure
            defaultOpen={Boolean(fields.address || fields.businessRegistration || fields.notes)}
            label="地址、商業登記與內部備註"
            summary="都是選填，會印在文件上（備註除外）"
          >
            <FormGrid columns={1}>
              <Field
                hint="會印在報價單與請款單的客戶資料區。"
                label="地址"
                onChange={(event) => update("address", event.target.value)}
                placeholder="香港九龍…"
                value={fields.address}
              />
              <Field
                label="商業登記號碼／統一編號"
                onChange={(event) => update("businessRegistration", event.target.value)}
                placeholder="12345678"
                value={fields.businessRegistration}
              />
              <TextareaField
                hint="只有你的團隊看得到，不會印在任何文件上。"
                label="內部備註"
                onChange={(event) => update("notes", event.target.value)}
                placeholder="付款習慣、聯絡偏好…"
                rows={2}
                value={fields.notes}
              />
            </FormGrid>
          </Disclosure>
        </FormSection>
        <FormError>{message}</FormError>
      </form>
    </Modal>
  );
}
