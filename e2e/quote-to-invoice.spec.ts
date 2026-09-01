import { expect, test } from "@playwright/test";

import { confirmDialog, fillLine, signIn, statusBadge } from "./helpers";

/**
 * Flow A — login → quote → save → send → accept → convert to invoice.
 * Covers the state machine and the single-primary-action rule at each step.
 */
test("報價單從草稿走到轉為請款單", async ({ page }) => {
  await signIn(page);

  await page.getByRole("link", { name: "報價單", exact: true }).click();
  await expect(page).toHaveURL(/\/quotes$/);

  await page.getByRole("link", { name: /建立報價單|建立第一張報價單/ }).first().click();
  await expect(page).toHaveURL(/\/quotes\/new$/);

  // The option label carries the contact suffix, so pick by index instead of an exact label.
  await page.getByLabel("選擇客戶").selectOption({ index: 1 });
  await expect(page.getByLabel("選擇客戶")).not.toHaveValue("");
  await fillLine(page, "名稱", "品牌識別設計");
  await fillLine(page, "數量", "1");
  await fillLine(page, "單價（HKD）", "48000");
  await fillLine(page, "折扣（HKD）", "3000");
  await expect(page.locator(".line-subtotal b")).toHaveText("HKD 45,000.00");

  await page.getByRole("button", { name: "儲存為草稿" }).click();
  await expect(page).toHaveURL(/\/quotes\/[a-f\d]{24}$/);
  await expect(statusBadge(page)).toHaveText("草稿");

  // draft → sent
  await page.getByRole("button", { name: "標示為已發送" }).click();
  await confirmDialog(page, "標示為已發送");
  await expect(statusBadge(page)).toHaveText("已發送");
  // A sent quote must no longer offer editing.
  await expect(page.getByRole("link", { name: "編輯" })).toHaveCount(0);

  // sent → accepted
  await page.getByRole("button", { name: "客戶已接受" }).click();
  await confirmDialog(page, "標示為已接受");
  await expect(statusBadge(page)).toHaveText("已接受");

  // accepted → invoice
  await page.getByRole("button", { name: "轉為請款單" }).click();
  await expect(page.getByRole("link", { name: /開啟請款單 INV-/ })).toBeVisible();
  await expect(page.locator(".related-items")).toContainText("請款單 INV-");
});
