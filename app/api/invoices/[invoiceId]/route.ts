import { ObjectId } from "mongodb";
import { z } from "zod";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { invoicePayloadSchema } from "@/lib/invoice";
import { activeCustomerSnapshot, invoicesCollection, serializeInvoice } from "@/lib/invoice-store";
import { calculatedInvoiceLines, calculatedInvoiceTotals } from "@/lib/invoice";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";

export const runtime = "nodejs";
const actionSchema = z.object({ action: z.enum(["send", "void"]) }).strict();
async function context(params: Promise<{ invoiceId: string }>) { const { invoiceId } = await params; return ObjectId.isValid(invoiceId) ? new ObjectId(invoiceId) : null; }
async function owned(id: ObjectId, user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) { return (await invoicesCollection()).findOne({ _id: id, organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) }); }
async function permitted(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) { return canUseWorkspaceFeature(user, "invoices"); }
export async function GET(_: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const id = await context(params); if (!id) return Response.json({ message: "請款單不存在。" }, { status: 404 });
  try { const user = await getCurrentUser(); if (!user) return Response.json({ message: "請先登入。" }, { status: 401 }); if (!await permitted(user)) return Response.json({ message: "此工作區目前無法使用請款單功能。" }, { status: 403 }); const invoice = await owned(id, user); return invoice ? Response.json({ invoice: serializeInvoice(invoice) }) : Response.json({ message: "請款單不存在。" }, { status: 404 }); } catch { return Response.json({ message: "無法讀取請款單。" }, { status: 503 }); }
}
export async function PUT(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const id = await context(params); const parsed = invoicePayloadSchema.safeParse(await request.json().catch(() => null)); if (!id || !parsed.success) return Response.json({ message: "請款單資料格式不正確。" }, { status: 400 });
  try { const user = await getCurrentUser(); if (!user) return Response.json({ message: "請先登入。" }, { status: 401 }); if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法更新請款單。" }, { status: 403 }); if (!await permitted(user)) return Response.json({ message: "此工作區目前無法使用請款單功能。" }, { status: 403 }); const invoice = await owned(id, user); if (!invoice) return Response.json({ message: "請款單不存在。" }, { status: 404 }); if (invoice.status !== "draft") return Response.json({ message: "只有草稿狀態的請款單可編輯。" }, { status: 409 }); const lines = calculatedInvoiceLines(parsed.data.lines); const customerChanged = invoice.customerId?.toHexString() !== parsed.data.customerId; const result = await (await invoicesCollection()).findOneAndUpdate({ _id: id, organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id), status: "draft" }, { $set: { customerId: new ObjectId(parsed.data.customerId), customerSnapshot: customerChanged ? await activeCustomerSnapshot(user, parsed.data.customerId) : invoice.customerSnapshot, dueDate: parsed.data.dueDate, issueDate: parsed.data.issueDate, lines, notes: parsed.data.notes, terms: parsed.data.terms, ...calculatedInvoiceTotals(lines), updatedAt: new Date() } }, { returnDocument: "after" }); return result ? Response.json({ invoice: serializeInvoice(result) }) : Response.json({ message: "請款單已被更新，請重新整理。" }, { status: 409 });
  } catch (error) { if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") return Response.json({ message: "所選客戶不存在、已封存或不屬於目前工作區。" }, { status: 404 }); return Response.json({ message: "無法更新請款單。" }, { status: 503 }); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const id = await context(params); const parsed = actionSchema.safeParse(await request.json().catch(() => null)); if (!id || !parsed.success) return Response.json({ message: "請款單操作格式不正確。" }, { status: 400 });
  try { const user = await getCurrentUser(); if (!user) return Response.json({ message: "請先登入。" }, { status: 401 }); if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法更新請款單。" }, { status: 403 }); if (!await permitted(user)) return Response.json({ message: "此工作區目前無法使用請款單功能。" }, { status: 403 }); const invoice = await owned(id, user); if (!invoice) return Response.json({ message: "請款單不存在。" }, { status: 404 }); const allowed = parsed.data.action === "send" ? invoice.status === "draft" : invoice.status === "draft" || invoice.status === "sent"; if (!allowed) return Response.json({ message: "目前狀態不可進行此操作。" }, { status: 409 }); const next = parsed.data.action === "send" ? { status: "sent" as const, sentAt: new Date(), updatedAt: new Date() } : { status: "void" as const, updatedAt: new Date() }; const result = await (await invoicesCollection()).findOneAndUpdate({ _id: id, organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id), status: invoice.status }, { $set: next }, { returnDocument: "after" }); return result ? Response.json({ invoice: serializeInvoice(result) }) : Response.json({ message: "請款單已被更新，請重新整理。" }, { status: 409 });
  } catch { return Response.json({ message: "無法更新請款單。" }, { status: 503 }); }
}
