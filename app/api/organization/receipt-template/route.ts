import { z } from "zod";

import { canManageOrganizationSettings, getCurrentUser, updateOrganizationReceiptTemplate } from "@/lib/auth";
import type { ReceiptTemplate } from "@/lib/receipt-template";

export const runtime = "nodejs";

const templateSchema = z.object({
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  logoPosition: z.enum(["left", "center", "right"]),
  preset: z.enum(["classic", "minimal", "formal"]),
  receiptTitle: z.string().trim().min(1).max(40),
  sealChineseName: z.string().trim().max(40),
  sealEnglishName: z.string().trim().max(80),
  sealSource: z.enum(["generated", "uploaded"]),
  showBusinessRegistration: z.boolean(),
  showContact: z.boolean(),
  showDisclaimer: z.boolean(),
  showNotes: z.boolean(),
  showPaymentMethod: z.boolean(),
  showSignature: z.boolean(),
  showSeal: z.boolean(),
}).strict();

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    return Response.json({ receiptTemplate: user.organization.receiptTemplate });
  } catch {
    return Response.json({ message: "無法讀取收據樣式。" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const parsed = templateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "收據樣式設定不正確。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageOrganizationSettings(user)) return Response.json({ message: "你沒有修改公司收據樣式的權限。" }, { status: 403 });
    await updateOrganizationReceiptTemplate(user, parsed.data as ReceiptTemplate);
    return Response.json({ receiptTemplate: parsed.data });
  } catch {
    return Response.json({ message: "無法儲存收據樣式。" }, { status: 503 });
  }
}
