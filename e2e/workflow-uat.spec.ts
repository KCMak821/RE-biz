import { expect, test } from "@playwright/test";

import { operator } from "./global-setup";
import {
  amountOf,
  confirmDialog,
  createQuote,
  dashboardIncome,
  documentNumber,
  signIn,
  signOut,
  statusBadge,
} from "./helpers";

/**
 * Flow G — the acceptance test for the whole operating loop, run the way a real
 * company runs it: one person starts the job, another finishes it.
 *
 *   owner:    customer → quote → sent → sign out
 *   operator: accept → invoice → sent → payment → receipt → sign out
 *   owner:    dashboard
 *
 * The assertion that matters is the last one. A single HKD 12,345 trade travels
 * through four documents, and the workspace's income must move by exactly
 * HKD 12,345 — not twice that, and not zero.
 */
const AMOUNT = 12_345;
const CUSTOMER = "UAT 驗收客戶有限公司";

test("一筆交易由擁有者開始、操作員接手，收入只認列一次", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const operatorContext = await browser.newContext();

  try {
    /* ---------------------------------------------------- owner: quote it up */
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage);
    const incomeBefore = await dashboardIncome(ownerPage);

    await ownerPage.goto("/customers");
    await ownerPage.getByRole("button", { name: "新增客戶" }).first().click();
    const customerDialog = ownerPage.locator("dialog.modal[open]");
    await customerDialog.getByLabel("客戶名稱").fill(CUSTOMER);
    await customerDialog.getByLabel("聯絡人").fill("驗收先生");
    await customerDialog.getByRole("button", { name: "新增客戶" }).click();
    await expect(ownerPage.locator(".dtable tbody")).toContainText(CUSTOMER);

    await createQuote(ownerPage, { customer: CUSTOMER, name: "年度顧問合約", unitPrice: String(AMOUNT) });
    const quoteUrl = ownerPage.url();
    const quoteNumber = await documentNumber(ownerPage, "QUO");
    await expect(statusBadge(ownerPage)).toHaveText("草稿");

    await ownerPage.getByRole("button", { name: "標示為已發送" }).click();
    await confirmDialog(ownerPage, "標示為已發送");
    await expect(statusBadge(ownerPage)).toHaveText("已發送");
    // A sent quote is locked, and the owner cannot yet bill it.
    await expect(ownerPage.getByRole("link", { name: "編輯" })).toHaveCount(0);
    await expect(ownerPage.getByRole("button", { name: "轉為請款單" })).toHaveCount(0);

    await signOut(ownerPage);

    /* --------------------------------- operator: accept, bill, collect, receipt */
    const operatorPage = await operatorContext.newPage();
    await signIn(operatorPage, operator);

    // The colleague finds it in the shared workspace, not by being its author.
    await operatorPage.goto("/quotes?status=sent");
    await expect(operatorPage.locator(".dtable tbody")).toContainText(quoteNumber);

    await operatorPage.goto(quoteUrl);
    await expect(operatorPage.locator(".page-title")).toHaveText(quoteNumber);
    await operatorPage.getByRole("button", { name: "客戶已接受" }).click();
    await confirmDialog(operatorPage, "標示為已接受");
    await expect(statusBadge(operatorPage)).toHaveText("已接受");

    await operatorPage.getByRole("button", { name: "轉為請款單" }).click();
    await expect(operatorPage.getByRole("link", { name: /開啟請款單 INV-/ })).toBeVisible();
    // Converting twice is not on offer any more.
    await expect(operatorPage.getByRole("button", { name: "轉為請款單" })).toHaveCount(0);
    await operatorPage.getByRole("link", { name: /開啟請款單 INV-/ }).click();
    await expect(operatorPage).toHaveURL(/\/invoices\/[a-f\d]{24}$/);

    const invoiceUrl = operatorPage.url();
    const invoiceNumber = await documentNumber(operatorPage, "INV");
    await expect(statusBadge(operatorPage)).toHaveText("草稿");
    // Nothing was retyped: the customer and the amount came from the quote.
    const invoiceSummary = operatorPage.locator(".summary");
    await expect(invoiceSummary).toContainText(CUSTOMER);
    await expect(invoiceSummary).toContainText("HKD 12,345.00");
    await expect(operatorPage.locator(".related-items")).toContainText(`來源報價單 ${quoteNumber}`);

    await operatorPage.getByRole("button", { name: "標示為已發送" }).click();
    await confirmDialog(operatorPage, "標示為已發送");
    await expect(statusBadge(operatorPage)).toHaveText("未付款");

    await operatorPage.getByRole("button", { name: "登記收款" }).click();
    const paymentDialog = operatorPage.locator("dialog.modal[open]");
    await expect(paymentDialog.getByLabel("本次收到金額（HKD）")).toHaveValue(String(AMOUNT));
    await paymentDialog.getByLabel("備註").fill("銀行轉帳");
    await paymentDialog.getByRole("button", { name: "登記這筆收款" }).click();

    await expect(statusBadge(operatorPage)).toHaveText("已付款");
    await expect(invoiceSummary).toContainText("已全數收妥");
    // The payment history names who booked it.
    await expect(operatorPage.locator(".payment-row")).toHaveCount(1);
    await expect(operatorPage.locator(".payment-meta")).toContainText(operator.name);

    await operatorPage.getByRole("button", { name: "開立收據" }).click();
    await confirmDialog(operatorPage, "開立收據");
    const receiptLink = operatorPage.getByRole("link", { name: /查看收據 RC-/ });
    await expect(receiptLink).toBeVisible();
    // A second receipt is not on offer.
    await expect(operatorPage.getByRole("button", { name: "開立收據" })).toHaveCount(0);

    await receiptLink.click();
    await expect(operatorPage).toHaveURL(/\/receipts\/[a-f\d]{24}$/);
    const receiptNumber = await documentNumber(operatorPage, "RC");
    await expect(operatorPage.locator(".page-title-row .badge").first()).toHaveText("已收款");
    await expect(operatorPage.locator(".summary")).toContainText("HKD 12,345.00");

    /* ------------------------------------------- the chain links back together */
    await expect(operatorPage.locator(".related-items")).toContainText(`來源請款單 ${invoiceNumber}`);
    await expect(operatorPage.locator(".related-items")).toContainText(`來源報價單 ${quoteNumber}`);
    await operatorPage.getByRole("link", { name: `來源請款單 ${invoiceNumber}` }).click();
    await expect(operatorPage).toHaveURL(invoiceUrl);
    await operatorPage.getByRole("link", { name: `來源報價單 ${quoteNumber}` }).click();
    await expect(operatorPage).toHaveURL(quoteUrl);
    // From the quote, both downstream documents are one click away.
    await expect(operatorPage.locator(".related-items")).toContainText(`請款單 ${invoiceNumber}`);
    await expect(operatorPage.locator(".related-items")).toContainText(`收據 ${receiptNumber}`);

    await signOut(operatorPage);

    /* ------------------------------------------------- owner: the books agree */
    const ownerAgain = await ownerContext.newPage();
    await signIn(ownerAgain);

    // The release gate: one trade, one recognition of HKD 12,345.
    expect(await dashboardIncome(ownerAgain)).toBe(incomeBefore + AMOUNT);

    // The ledger shows it once, and once only.
    await ownerAgain.goto(`/ledger?q=${receiptNumber}`);
    await expect(ownerAgain.locator(".dtable tbody tr")).toHaveCount(1);
    const ledgerAmount = amountOf(((await ownerAgain.locator(".dtable tbody tr").first().textContent()) ?? "").trim());
    expect(ledgerAmount).toBe(AMOUNT);

    // The finished trade is filed as settled and chases nobody.
    await ownerAgain.goto("/invoices?status=paid");
    await expect(ownerAgain.locator(".dtable tbody")).toContainText(invoiceNumber);
    for (const open of ["unpaid", "overdue", "partially_paid", "draft"]) {
      await ownerAgain.goto(`/invoices?status=${open}`);
      // An empty list renders no table at all, so assert against the page.
      await expect(ownerAgain.locator("body")).not.toContainText(invoiceNumber);
    }
    // Its quote is decided, so it is off the "waiting" and "ready to bill" lists.
    await ownerAgain.goto("/quotes?status=sent");
    await expect(ownerAgain.locator("body")).not.toContainText(quoteNumber);
    await ownerAgain.goto("/quotes?status=accepted");
    await expect(ownerAgain.locator(".dtable tbody")).toContainText(quoteNumber);
  } finally {
    await ownerContext.close();
    await operatorContext.close();
  }
});
