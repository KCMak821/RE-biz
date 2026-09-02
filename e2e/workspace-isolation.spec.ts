import { expect, test, type Page } from "@playwright/test";

import { outsider } from "./global-setup";
import { signIn } from "./helpers";

/**
 * Flow H — the tenant boundary, probed with real ids.
 *
 * Another company's owner is given the exact quote, invoice and receipt ids from
 * this workspace and tries every verb the app offers: read, change status,
 * convert, collect, receipt. `organizationId` is the whole boundary, so each one
 * must come back as "not found" — never a leak, and never a partial success.
 */

/** Runs one request from inside the signed-in page, so the real session cookie is used. */
async function call(page: Page, path: string, method = "GET", body?: unknown) {
  return page.evaluate(
    async ([url, verb, payload]) => {
      const response = await fetch(url as string, {
        body: payload ? JSON.stringify(payload) : undefined,
        headers: payload ? { "content-type": "application/json" } : undefined,
        method: verb as string,
      });
      return { body: await response.json().catch(() => null), status: response.status };
    },
    [path, method, body] as const,
  );
}

test("另一間公司即使知道文件 id 也讀不到、改不了", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const outsiderContext = await browser.newContext();

  try {
    /* ------------------------------------- a complete chain inside workspace A */
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage);

    const customer = await call(ownerPage, "/api/customers", "POST", {
      address: "",
      businessRegistration: "",
      companyName: "",
      contact: "隔離測試",
      email: "",
      name: "隔離測試客戶",
      notes: "",
      phone: "",
    });
    expect(customer.status).toBe(201);

    const quote = await call(ownerPage, "/api/quotes", "POST", {
      customer: {
        address: "",
        businessRegistration: "",
        companyName: "",
        contact: "隔離測試",
        email: "",
        name: "隔離測試客戶",
        notes: "",
        phone: "",
      },
      customerId: customer.body.customer.id,
      issueDate: "2026-08-01",
      lines: [{ description: "", discountAmount: 0, name: "隔離測試項目", quantity: 1, unitPrice: 800 }],
      notes: "",
      terms: "",
      validUntil: "2036-08-31",
    });
    expect(quote.status).toBe(201);
    const quoteId = quote.body.quote.id;

    await call(ownerPage, `/api/quotes/${quoteId}`, "PUT", { action: "status", status: "sent" });
    await call(ownerPage, `/api/quotes/${quoteId}`, "PUT", { action: "status", status: "accepted" });
    const invoice = await call(ownerPage, `/api/quotes/${quoteId}/invoice`, "POST");
    expect(invoice.status).toBe(201);
    const invoiceId = invoice.body.invoice.id;

    await call(ownerPage, `/api/invoices/${invoiceId}`, "PATCH", { action: "send" });
    await call(ownerPage, `/api/invoices/${invoiceId}/payments`, "POST", {
      amount: 800,
      note: "",
      paidAt: "2026-09-01",
    });
    const receipt = await call(ownerPage, `/api/invoices/${invoiceId}/receipt`, "POST");
    expect(receipt.status).toBe(201);
    const receiptId = receipt.body.receipt.id;

    /* ------------------------------------------- workspace B, armed with the ids */
    const outsiderPage = await outsiderContext.newPage();
    await signIn(outsiderPage, outsider);
    // Their own workspace is empty — nothing has leaked across.
    await expect(outsiderPage.locator(".stat").filter({ hasText: "累計收入" }).locator(".stat-value")).toHaveText(
      "HKD 0.00",
    );

    for (const [path, method, body] of [
      [`/api/quotes/${quoteId}`, "GET"],
      [`/api/quotes/${quoteId}`, "PUT", { action: "status", status: "rejected" }],
      [`/api/quotes/${quoteId}/invoice`, "POST"],
      [`/api/quotes/${quoteId}/receipt`, "POST"],
      [`/api/quotes/${quoteId}/duplicate`, "POST"],
      [`/api/invoices/${invoiceId}`, "GET"],
      [`/api/invoices/${invoiceId}`, "PATCH", { action: "void" }],
      [`/api/invoices/${invoiceId}/payments`, "POST", { amount: 1, note: "", paidAt: "2026-09-01" }],
      [`/api/invoices/${invoiceId}/receipt`, "POST"],
      [`/api/receipts/${receiptId}`, "GET"],
      [`/api/receipts/${receiptId}`, "PUT", { paymentStatus: "paid" }],
    ] as const) {
      const response = await call(outsiderPage, path, method, body);
      expect(response.status, `${method} ${path}`).toBe(404);
    }

    // The detail pages say the same thing the API does.
    await outsiderPage.goto(`/quotes/${quoteId}`);
    await expect(outsiderPage.locator("body")).toContainText("報價單不存在。");
    await outsiderPage.goto(`/invoices/${invoiceId}`);
    await expect(outsiderPage.locator("body")).toContainText("請款單不存在。");
    await outsiderPage.goto(`/receipts/${receiptId}`);
    await expect(outsiderPage.locator("body")).toContainText("收據不存在。");

    /* ----------------------------------- and workspace A is exactly as it was */
    const unchanged = await call(ownerPage, `/api/invoices/${invoiceId}`, "GET");
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.invoice.effectiveStatus).toBe("paid");
    expect(unchanged.body.invoice.paidAmount).toBe(800);
    expect(unchanged.body.receipt).not.toBeNull();
  } finally {
    await ownerContext.close();
    await outsiderContext.close();
  }
});
