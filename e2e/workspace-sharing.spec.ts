import { expect, test, type Page } from "@playwright/test";

import { operator } from "./global-setup";
import { signIn } from "./helpers";

/**
 * Flow F — one company, two people, one set of books.
 *
 * The earlier flows all run as the owner and leave receipts, quotes and
 * invoices behind. A second member of the same organization must open the app
 * and find exactly that data: same dashboard totals, same list rows, and detail
 * pages that open instead of 404-ing. This is the regression that made a newly
 * invited colleague see an empty, zeroed workspace.
 */

/** The value shown under one dashboard stat label. */
function stat(page: Page, label: string) {
  return page.locator(".stat").filter({ hasText: label }).locator(".stat-value");
}

/** The first row's bold identifier in a data table. */
function firstRowIdentifier(page: Page) {
  return page.locator(".dtable tbody tr strong").first();
}

test("同一公司的第二位成員看到相同的收入、收據與報價單", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const operatorContext = await browser.newContext();
  try {
    const ownerPage = await ownerContext.newPage();
    const operatorPage = await operatorContext.newPage();

    await signIn(ownerPage);
    await signIn(operatorPage, operator);

    // --- the dashboard reports the company's money, not the member's ---------
    const labels = ["累計收入", "累計支出", "目前餘額"];
    const ownerTotals: string[] = [];
    for (const label of labels) {
      await expect(stat(ownerPage, label)).toBeVisible();
      ownerTotals.push(((await stat(ownerPage, label).textContent()) ?? "").trim());
    }
    // The owner's flows already booked income, so a zeroed operator dashboard
    // would be the exact bug under test rather than an empty workspace.
    expect(ownerTotals[0]).not.toBe("");
    for (const [index, label] of labels.entries()) {
      await expect(stat(operatorPage, label)).toHaveText(ownerTotals[index]);
    }

    // --- receipts: same first row, and its detail page opens ------------------
    await ownerPage.goto("/receipts");
    const receiptNumber = ((await firstRowIdentifier(ownerPage).textContent()) ?? "").trim();
    expect(receiptNumber).not.toBe("");

    await operatorPage.goto("/receipts");
    await expect(firstRowIdentifier(operatorPage)).toHaveText(receiptNumber);
    await operatorPage.locator(".dtable tbody tr a").first().click();
    await expect(operatorPage).toHaveURL(/\/receipts\/[a-f\d]{24}$/);
    await expect(operatorPage.locator("body")).toContainText(receiptNumber);

    // --- quotes: the list row and the detail page agree ----------------------
    await ownerPage.goto("/quotes");
    const quoteNumber = ((await firstRowIdentifier(ownerPage).textContent()) ?? "").trim();
    expect(quoteNumber).not.toBe("");

    await operatorPage.goto("/quotes");
    await expect(firstRowIdentifier(operatorPage)).toHaveText(quoteNumber);
    await operatorPage.locator(".dtable tbody tr a").first().click();
    await expect(operatorPage).toHaveURL(/\/quotes\/[a-f\d]{24}$/);
    await expect(operatorPage.locator("body")).toContainText(quoteNumber);

    // --- a quote the operator creates continues the company's numbering ------
    const created = await operatorPage.evaluate(async () => {
      const response = await fetch("/api/quotes", {
        body: JSON.stringify({
          customer: {
            address: "",
            businessRegistration: "",
            companyName: "",
            contact: "同事",
            email: "",
            name: "共用工作區客戶",
            notes: "",
            phone: "",
          },
          issueDate: "2026-08-31",
          lines: [{ description: "", discountAmount: 0, name: "操作員項目", quantity: 1, unitPrice: 100 }],
          notes: "",
          terms: "",
          validUntil: "2026-09-30",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      return { quoteNumber: (await response.json())?.quote?.quoteNumber, status: response.status };
    });
    expect(created.status).toBe(201);
    expect(created.quoteNumber).not.toBe(quoteNumber);

    // The owner sees the colleague's quote without reloading anything special.
    await ownerPage.goto("/quotes");
    await expect(ownerPage.locator(".dtable tbody")).toContainText(created.quoteNumber);
  } finally {
    await ownerContext.close();
    await operatorContext.close();
  }
});
