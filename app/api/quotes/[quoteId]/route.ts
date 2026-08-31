import { ObjectId } from "mongodb";
import { z } from "zod";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import {
  calculatedLines,
  calculatedQuoteTotals,
  quoteEffectiveStatus,
  quotePayloadSchema,
  type QuoteStatus,
} from "@/lib/quotation";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { receiptsCollection } from "@/lib/receipt-store";
import {
  quotesCollection,
  resolveQuotePayload,
  type QuoteDocument,
} from "@/lib/quote-store";

export const runtime = "nodejs";

const statusSchema = z
  .object({
    action: z.literal("status"),
    status: z.enum(["sent", "accepted", "rejected"]),
  })
  .strict();

async function quoteId(params: Promise<{ quoteId: string }>) {
  const { quoteId: value } = await params;
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}
function serialize(document: QuoteDocument & { _id: ObjectId }) {
  return {
    companySnapshot: document.companySnapshot,
    createdAt: document.createdAt.toISOString(),
    currency: document.currency,
    customerId: document.customerId?.toHexString(),
    customerSnapshot: document.customerSnapshot,
    id: document._id.toHexString(),
    issueDate: document.issueDate,
    lines: document.lines,
    notes: document.notes,
    quoteNumber: document.quoteNumber,
    receiptId: document.receiptId?.toHexString(),
    status: quoteEffectiveStatus(document.status, document.validUntil),
    storedStatus: document.status,
    terms: document.terms,
    totalAmount: document.totalAmount,
    totalDiscount: document.totalDiscount,
    updatedAt: document.updatedAt.toISOString(),
    validUntil: document.validUntil,
  };
}
async function ownedQuote(
  id: ObjectId,
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
) {
  return (await quotesCollection()).findOne({
    _id: id,
    organizationId: new ObjectId(user.organization.id),
    createdBy: new ObjectId(user.id),
  });
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  const id = await quoteId(params);
  if (!id) return Response.json({ message: "報價單不存在。" }, { status: 404 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!(await canUseWorkspaceFeature(user, "quotations")))
      return Response.json(
        { message: "此工作區目前無法使用報價單功能。" },
        { status: 403 },
      );
    const quote = await ownedQuote(id, user);
    if (!quote)
      return Response.json({ message: "報價單不存在。" }, { status: 404 });
    const receipt = quote.receiptId
      ? await (
          await receiptsCollection()
        ).findOne({
          _id: quote.receiptId,
          organizationId: new ObjectId(user.organization.id),
          createdBy: new ObjectId(user.id),
        })
      : await (
          await receiptsCollection()
        ).findOne({
          sourceQuoteId: id,
          organizationId: new ObjectId(user.organization.id),
          createdBy: new ObjectId(user.id),
        });
    return Response.json({
      quote: serialize(quote),
      receipt: receipt
        ? {
            id: receipt._id.toHexString(),
            paymentStatus: receipt.paymentStatus,
            receiptNumber: receipt.receiptNumber,
          }
        : null,
    });
  } catch {
    return Response.json({ message: "無法讀取報價單。" }, { status: 503 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  const id = await quoteId(params);
  if (!id) return Response.json({ message: "報價單不存在。" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const statusRequest = statusSchema.safeParse(body);
  const quoteRequest = quotePayloadSchema.safeParse(body);
  if (!statusRequest.success && !quoteRequest.success)
    return Response.json(
      { message: "報價單資料格式不正確。" },
      { status: 400 },
    );
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user))
      return Response.json(
        { message: "你的角色只有檢視權限，無法更新報價單。" },
        { status: 403 },
      );
    if (!(await canUseWorkspaceFeature(user, "quotations")))
      return Response.json(
        { message: "此工作區目前無法使用報價單功能。" },
        { status: 403 },
      );
    const quote = await ownedQuote(id, user);
    if (!quote)
      return Response.json({ message: "報價單不存在。" }, { status: 404 });
    if (statusRequest.success) {
      if (quoteEffectiveStatus(quote.status, quote.validUntil) === "expired")
        return Response.json(
          { message: "已失效的報價單不可變更狀態。" },
          { status: 409 },
        );
      const allowed: Record<QuoteDocument["status"], QuoteStatus[]> = {
        accepted: [],
        draft: ["sent"],
        rejected: [],
        sent: ["accepted", "rejected"],
      };
      if (!allowed[quote.status].includes(statusRequest.data.status))
        return Response.json(
          { message: "目前狀態不可進行此轉換。" },
          { status: 409 },
        );
      const result = await (
        await quotesCollection()
      ).findOneAndUpdate(
        {
          _id: id,
          organizationId: new ObjectId(user.organization.id),
          createdBy: new ObjectId(user.id),
        },
        { $set: { status: statusRequest.data.status, updatedAt: new Date() } },
        { returnDocument: "after" },
      );
      return Response.json({ quote: result ? serialize(result) : null });
    }
    if (
      quote.status !== "draft" ||
      quoteEffectiveStatus(quote.status, quote.validUntil) !== "draft"
    )
      return Response.json(
        { message: "只有草稿狀態的報價單可編輯。" },
        { status: 409 },
      );
    const input = quoteRequest.data!;
    const existingCustomerId = quote.customerId?.toHexString();
    const customerChanged =
      (input.customerId ?? undefined) !== existingCustomerId;
    // A normal draft edit must keep its saved customer snapshot. The UI marks a
    // deliberate selection with customerSelected; changing to/manual customer
    // is also necessarily a snapshot change.
    const refreshCustomer = customerChanged || input.customerSelected === true;
    const resolved = refreshCustomer
      ? await resolveQuotePayload(user, input)
      : {
          ...input,
          customer: quote.customerSnapshot,
          customerId: existingCustomerId,
          lines: calculatedLines(input.lines),
          ...calculatedQuoteTotals(calculatedLines(input.lines)),
        };
    const result = await (
      await quotesCollection()
    ).findOneAndUpdate(
      {
        _id: id,
        organizationId: new ObjectId(user.organization.id),
        createdBy: new ObjectId(user.id),
        status: "draft",
      },
      {
        $set: {
          customerId: resolved.customerId
            ? new ObjectId(resolved.customerId)
            : undefined,
          customerSnapshot: resolved.customer,
          issueDate: resolved.issueDate,
          lines: resolved.lines,
          notes: resolved.notes,
          terms: resolved.terms,
          totalAmount: resolved.totalAmount,
          totalDiscount: resolved.totalDiscount,
          updatedAt: new Date(),
          validUntil: resolved.validUntil,
        },
      },
      { returnDocument: "after" },
    );
    return result
      ? Response.json({ quote: serialize(result) })
      : Response.json(
          { message: "報價單已被更新，請重新整理。" },
          { status: 409 },
        );
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND")
      return Response.json(
        { message: "所選客戶不存在或不屬於目前帳號。" },
        { status: 404 },
      );
    return Response.json({ message: "無法更新報價單。" }, { status: 503 });
  }
}
