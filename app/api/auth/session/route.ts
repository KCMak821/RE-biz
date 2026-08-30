import { getCurrentUser, prepareAuthCollections } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET() {
  try {
    await prepareAuthCollections();
    const [user, userCount] = await Promise.all([
      getCurrentUser(),
      (await getDatabase()).collection("users").countDocuments({}, { limit: 1 }),
    ]);
    return Response.json({ setupRequired: userCount === 0, user });
  } catch {
    return Response.json({ message: "資料庫尚未設定或無法連線。", setupRequired: false, user: null }, { status: 503 });
  }
}
