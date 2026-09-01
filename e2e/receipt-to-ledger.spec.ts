import { expect, test } from "@playwright/test";

import { confirmDialog, signIn } from "./helpers";

/**
 * Flow C — an accepted quote produces a pending receipt, confirming it turns the
 * receipt into income, and the ledger picks it up. This is the one place where
 * the two collections have to agree.
 */
test("由報價單建立的收據確認收款後成為收支記帳的收入", async ({ page }) => {
  await signIn(page);

  // Flow A already left an accepted quote in place.
  await page.goto("/quotes?status=accepted");
  await page.locator(".dtable tbody tr a").first().click();
  await expect(page).toHaveURL(/\/quotes\/[a-f\d]{24}$/);

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

  // Confirm from the receipt's own detail page, which is new this round.
  await row.locator("a").first().click();
  await expect(page).toHaveURL(/\/receipts\/[a-f\d]{24}$/);
  await expect(page.locator(".page-title")).toHaveText(receiptNumber);

  await page.getByRole("button", { name: "確認已收款" }).click();
  await confirmDialog(page, "確認已收款");
  await expect(page.locator(".page-title-row .badge").first()).toHaveText("已收款");

  // The ledger must now carry it as receipt-backed income.
  await page.goto("/ledger");
  await expect(page.locator(".dtable tbody tr").first()).toContainText(receiptNumber);
  await expect(page.locator(".dtable tbody tr").first()).toContainText("由收據自動帶入");
});
