import { expect, test } from "@playwright/test";

import { confirmDialog, fillLine, signIn, statusBadge } from "./helpers";

/**
 * Flow B — create invoice → send → partial payment → partially_paid →
 * remaining payment → paid. The status is derived from the payment records, so
 * this asserts the numbers as well as the badge.
 */
test("請款單登記部分收款後再收足，狀態依已收金額推導", async ({ page }) => {
  await signIn(page);

  await page.getByRole("link", { name: "請款單", exact: true }).click();
  await page.getByRole("link", { name: /建立請款單|建立第一張請款單/ }).first().click();
  await expect(page).toHaveURL(/\/invoices\/new$/);

  // The option label carries the contact suffix, so pick by index instead of an exact label.
  await page.getByLabel("選擇客戶").selectOption({ index: 1 });
  await expect(page.getByLabel("選擇客戶")).not.toHaveValue("");
  await fillLine(page, "名稱", "顧問服務");
  await fillLine(page, "數量", "1");
  await fillLine(page, "單價（HKD）", "10000");
  await fillLine(page, "折扣（HKD）", "0");

  await page.getByRole("button", { name: "儲存為草稿" }).click();
  await expect(page).toHaveURL(/\/invoices\/[a-f\d]{24}$/);
  await expect(statusBadge(page)).toHaveText("草稿");
  // A draft cannot be collected against.
  await expect(page.getByRole("button", { name: "登記收款" })).toHaveCount(0);

  await page.getByRole("button", { name: "標示為已發送" }).click();
  await confirmDialog(page, "標示為已發送");
  await expect(statusBadge(page)).toHaveText("未付款");

  const summary = page.locator(".summary");
  await expect(summary).toContainText("HKD 10,000.00");

  // --- first instalment: 4,000 of 10,000 --------------------------------------
  await page.getByRole("button", { name: "登記收款" }).click();
  const dialog = page.locator("dialog.modal[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("本次收到金額（HKD）").fill("4000");
  await dialog.getByLabel("備註").fill("訂金");
  await dialog.getByRole("button", { name: "登記這筆收款" }).click();

  await expect(statusBadge(page)).toHaveText("部分付款");
  await expect(summary).toContainText("HKD 4,000.00");
  await expect(summary).toContainText("HKD 6,000.00");
  await expect(page.locator(".payment-row")).toHaveCount(1);

  // --- overpayment is refused before it reaches the server ---------------------
  await page.getByRole("button", { name: "登記收款" }).click();
  await dialog.getByLabel("本次收到金額（HKD）").fill("99999");
  await dialog.getByRole("button", { name: "登記這筆收款" }).click();
  await expect(dialog.locator(".field-error")).toContainText("不可超過尚未收款");

  // --- remaining 6,000 settles the invoice ------------------------------------
  await dialog.getByLabel("本次收到金額（HKD）").fill("6000");
  await dialog.getByLabel("備註").fill("尾款");
  await dialog.getByRole("button", { name: "登記這筆收款" }).click();

  await expect(statusBadge(page)).toHaveText("已付款");
  await expect(summary).toContainText("已全數收妥");
  await expect(page.locator(".payment-row")).toHaveCount(2);
  // Nothing left to collect, so the action disappears.
  await expect(page.getByRole("button", { name: "登記收款" })).toHaveCount(0);

  // --- the list filters now find it -------------------------------------------
  await page.goto("/invoices?status=paid");
  await expect(page.locator(".dtable tbody tr")).toHaveCount(1);
  await page.goto("/invoices?status=unpaid");
  await expect(page.locator(".empty-title")).toBeVisible();
});
