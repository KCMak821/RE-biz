import { NextResponse } from "next/server";
import { z } from "zod";

import { createSession, registerOrganizationOwner, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

const imageDataUrl = z.string().max(1_500_000).optional();
const inputSchema = z.object({
  address: z.string().trim().max(1000).optional().default(""),
  businessRegistration: z.string().trim().max(100).optional().default(""),
  companyName: z.string().trim().min(1).max(200),
  contact: z.string().trim().max(500).optional().default(""),
  currency: z.enum(["HKD", "TWD", "USD"]).default("HKD"),
  email: z.string().trim().email().max(320),
  logoDataUrl: imageDataUrl,
  name: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(200),
  timeZone: z.string().trim().min(1).max(100).default("Asia/Hong_Kong"),
}).strict();

function parseLogo(dataUrl?: string) {
  if (!dataUrl) return undefined;
  const match = /^data:(image\/(?:jpeg|png|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("INVALID_LOGO");
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > 1_000_000) throw new Error("INVALID_LOGO");
  return { contentType: match[1] as "image/jpeg" | "image/png" | "image/svg+xml", data };
}

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "請填寫帳號、公司名稱與至少 12 字元的密碼。" }, { status: 400 });
  try {
    const user = await registerOrganizationOwner({ ...parsed.data, logo: parseLogo(parsed.data.logoDataUrl) });
    if (!user) throw new Error("USER_NOT_FOUND");
    const session = await createSession(user.id);
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(sessionCookie(session.token, session.expiresAt));
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_TAKEN") return Response.json({ message: "此 Email 已被使用，請直接登入。" }, { status: 409 });
    if (error instanceof Error && error.message === "INVALID_LOGO") return Response.json({ message: "Logo 只支援 PNG、JPG 或 SVG，且檔案需小於 1 MB。" }, { status: 400 });
    return Response.json({ message: "無法建立公司帳號。" }, { status: 503 });
  }
}
