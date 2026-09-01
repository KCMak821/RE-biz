import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

/**
 * Flow D — the unsaved-changes guard has to hold on every way out of an editor,
 * not just the sidebar. Each case here was a route that previously discarded
 * input silently.
 */
test.describe("未儲存變更保護", () => {
  const routesOut = [
    { name: "側邊欄", open: (page: import("@playwright/test").Page) => page.locator(".shell-sidebar").getByRole("link", { name: "收據", exact: true }).click() },
    { name: "Logo", open: (page: import("@playwright/test").Page) => page.locator(".brand").click() },
    { name: "Breadcrumb", open: (page: import("@playwright/test").Page) => page.locator(".crumbs").getByRole("link", { name: "報價單" }).click() },
    { name: "取消按鈕", open: (page: import("@playwright/test").Page) => page.getByRole("button", { name: "取消" }).click() },
  ];

  for (const route of routesOut) {
    test(`從${route.name}離開報價單編輯器時會先詢問`, async ({ page }) => {
      await signIn(page);
      await page.goto("/quotes/new");
      await expect(page.getByLabel("選擇客戶")).toBeVisible();

      // Make the page dirty.
      await page.locator(".line-card").first().getByLabel("名稱", { exact: true }).fill("尚未儲存的品項");

      await route.open(page);

      const dialog = page.locator("dialog.modal[open]");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("要放棄未儲存的變更嗎？");

      // Staying keeps both the page and the typed value.
      await dialog.getByRole("button", { name: "取消" }).click();
      await expect(page).toHaveURL(/\/quotes\/new$/);
      await expect(page.locator(".line-card").first().getByLabel("名稱", { exact: true })).toHaveValue(
        "尚未儲存的品項",
      );

      // Leaving deliberately does navigate away.
      await route.open(page);
      await page.locator("dialog.modal[open]").getByRole("button", { name: "離開並放棄變更" }).click();
      await expect(page).not.toHaveURL(/\/quotes\/new$/);
    });
  }

  test("沒有變更時導覽不會被打斷", async ({ page }) => {
    await signIn(page);
    await page.goto("/quotes/new");
    await expect(page.getByLabel("選擇客戶")).toBeVisible();

    await page.locator(".shell-sidebar").getByRole("link", { name: "收據", exact: true }).click();
    await expect(page).toHaveURL(/\/receipts$/);
    await expect(page.locator("dialog.modal[open]")).toHaveCount(0);
  });
});
