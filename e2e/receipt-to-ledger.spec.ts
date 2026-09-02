import { expect, test } from "@playwright/test";

import { confirmDialog, createQuote, signIn } from "./helpers";

/**
 * Flow C — the short route: an accepted quote settled straight into a receipt,
 * with no invoice in between. The receipt starts pending and only becomes income
 * once the money is confirmed, which is the one place two collections have to
 * agree.
 *
 * It builds its own quote rather than reusing flow A's: that one has been turned
 * into an invoice, and a quote on the billing path deliberately no longer offers
 * a direct receipt.
 */
test("由報價單直接建立的收據，確認收款後成為收支記帳的收入", async ({ page }) => {
  await signIn(page);

  await createQuote(page, { name: "即場付款服務", unitPrice: "6000" });

  await page.getByRole("button", { name: "標示為已發送" }).click();
  await confirmDialog(page, "標示為已發送");
  await page.getByRole("button", { name: "客戶已接受" }).click();
  await confirmDialog(page, "標示為已接受");

  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "建立收據草稿" }).click();
  await confirmDialog(page, "建立收據草稿");
  await expect(page.locator(".related-items")).toContainText("待收款");

  // The dashboard should now be asking for this receipt to be confirmed.
  await page.goto("/dashboard");
  await expect(page.locator(".todo-item").filter({ hasText: "收據等待確認收款" })).toHaveCount(1);
  await page.getByRole("link", { name: "確認收款" }).click();
  await expect(page).toHaveURL(/\/receipts\?status=pending$/);

  const row = page.locator(".dtable tbody tr").first();
  await expect(row).toContainText("待收款");
  const receiptNumber = (await row.locator("strong").first().textContent())?.trim() ?? "";
  expect(receiptNumber).toMatch(/^RC-/);

  await row.locator("a").first().click();
  await expect(page).toHaveURL(/\/receipts\/[a-f\d]{24}$/);
  await expect(page.locator(".page-title")).toHaveText(receiptNumber);
  // The receipt knows where it came from, and the link works.
  await expect(page.locator(".related-items")).toContainText("來源報價單");

  await page.getByRole("button", { name: "確認已收款" }).click();
  await confirmDialog(page, "確認已收款");
  await expect(page.locator(".page-title-row .badge").first()).toHaveText("已收款");

  // The ledger must now carry it as receipt-backed income.
  await page.goto("/ledger");
  await expect(page.locator(".dtable tbody tr").first()).toContainText(receiptNumber);
  await expect(page.locator(".dtable tbody tr").first()).toContainText("由收據自動帶入");
});
