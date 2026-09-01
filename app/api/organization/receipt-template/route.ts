import { z } from "zod";

import { canManageOrganizationSettings, canUseWorkspace, getCurrentUser, updateOrganizationReceiptTemplate } from "@/lib/auth";
import { uploadedSealHorizontalLimit, uploadedSealLayout, type ReceiptTemplate } from "@/lib/receipt-template";

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
  uploadedSealOffsetX: z.number().int(),
  uploadedSealOffsetY: z.number().int().min(uploadedSealLayout.minOffsetY).max(uploadedSealLayout.maxOffsetY),
  uploadedSealScale: z.number().int().min(uploadedSealLayout.minScale).max(uploadedSealLayout.maxScale),
}).strict().superRefine((template, context) => {
  const limit = uploadedSealHorizontalLimit(template.uploadedSealScale);
  if (Math.abs(template.uploadedSealOffsetX) > limit) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "印章水平位置超出簽署區安全範圍。",
      path: ["uploadedSealOffsetX"],
    });
  }
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canUseWorkspace(user)) return Response.json({ message: "此工作區目前已停用。" }, { status: 403 });
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
