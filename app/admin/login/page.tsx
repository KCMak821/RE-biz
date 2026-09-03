import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Callout } from "@/components/app/feedback";
import { googleConfig } from "@/lib/google-oauth";
import { getCurrentSuperAdmin } from "@/lib/platform-admin";
import { platformAdminAccessConfigured } from "@/lib/platform-auth";

import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "平台管理登入｜RE-Biz" };

/** One message per way this can fail, none of them saying who exists. */
const errors: Record<string, { detail: string; title: string }> = {
  bad_state: {
    detail: "請重新點一次「使用 Google 登入」。如果一直失敗，試試關掉無痕視窗或允許本站的 Cookie。",
    title: "登入流程已逾時",
  },
  cancelled: { detail: "你在 Google 的畫面上取消了授權。", title: "已取消登入" },
  exchange_failed: { detail: "Google 沒有完成驗證。請稍後再試一次。", title: "無法完成 Google 驗證" },
  not_allowed: {
    detail: "這個 Google 帳號不在平台管理者名單內。名單由 PLATFORM_ADMIN_EMAILS 環境變數決定。",
    title: "這個帳號沒有平台管理權限",
  },
  not_configured: {
    detail: "尚未設定 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET 或 PLATFORM_ADMIN_EMAILS。",
    title: "平台管理尚未設定",
  },
  unverified_email: { detail: "請先在 Google 驗證你的電子郵件再登入。", title: "這個 Google 帳號尚未驗證電郵" },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  let unavailable = false;
  try {
    if (await getCurrentSuperAdmin()) redirect("/admin");
  } catch {
    unavailable = true;
  }
  const configured = Boolean(googleConfig()) && platformAdminAccessConfigured();
  const failure = error ? errors[error] : undefined;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="admin-marker">平台管理</span>
        </div>

        {unavailable ? (
          <>
            <div className="auth-heading">
              <h1>暫時無法連線</h1>
              <p>系統無法連上資料庫，因此不能登入。這通常是暫時的，請稍後重新整理頁面再試一次。</p>
            </div>
            <p className="auth-status">如果情況持續，請確認資料庫連線設定。</p>
          </>
        ) : (
          <>
            <div className="auth-heading">
              <h1>平台管理登入</h1>
              <p>這是 RE-Biz 的平台後台，只給營運團隊使用。客戶請改用一般登入頁。</p>
            </div>

            {failure ? (
              <Callout title={failure.title} tone="warning">
                <p>{failure.detail}</p>
              </Callout>
            ) : null}

            {configured ? (
              <div className="auth-form">
                <a className="btn btn-primary btn-block" href="/api/admin/auth/google/start">
                  使用 Google 登入
                </a>
                <p className="auth-status">
                  只有列在平台管理者名單中的 Google 帳號可以進入。後台沒有密碼登入。
                </p>
              </div>
            ) : (
              <Callout title="平台管理尚未設定" tone="warning">
                <p>
                  請在部署環境設定 <code>GOOGLE_CLIENT_ID</code>、<code>GOOGLE_CLIENT_SECRET</code> 與{" "}
                  <code>PLATFORM_ADMIN_EMAILS</code>，然後重新整理這一頁。
                </p>
              </Callout>
            )}
          </>
        )}
      </section>
    </main>
  );
}
