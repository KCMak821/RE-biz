import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

const RECEIPTS_TO_CREATE = 25;

/**
 * Flow E — search, filter, paging and refresh on the receipts list. The point is
 * that the URL holds the state: a reload has to land you back where you were.
 */
test("收據列表的搜尋、篩選與分頁狀態保存在網址中", async ({ page }) => {
  await signIn(page);

  // Enough rows to need more than one page at the default size of 20.
  // Seeded through the page's own fetch: the session cookie is flagged Secure by
  // `next start`, and only the browser's cookie jar sends it over plain http.
  const status = await page.evaluate(async (count: number) => {
    const response = await fetch("/api/receipts", {
      body: JSON.stringify({
        receipts: Array.from({ length: count }, (_, index) => ({
          amount: 100 + index,
          description: index === 0 ? "獨一無二的顧問項目" : `分頁測試項目 ${index}`,
          issueDate: "2026-09-01",
          issuerName: "E2E 測試公司",
          payerName: index === 0 ? "分頁測試獨特付款人" : `分頁測試付款人 ${index}`,
          paymentMethod: "Cash",
        })),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    return response.status;
  }, RECEIPTS_TO_CREATE);
  expect(status).toBe(201);

  await page.goto("/receipts");
  await expect(page.locator(".dtable tbody tr")).toHaveCount(20);
  const pager = page.locator(".pager");
  await expect(pager).toBeVisible();

  // --- paging writes the page into the URL -----------------------------------
  await pager.getByRole("button", { name: "下一頁" }).click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(page.locator(".pager-status")).toContainText("第 2 /");
  const secondPageFirstRow = (await page.locator(".dtable tbody tr strong").first().textContent())?.trim();

  // --- a reload keeps the page ------------------------------------------------
  await page.reload();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(page.locator(".dtable tbody tr strong").first()).toHaveText(secondPageFirstRow ?? "");

  // --- browser back returns to page 1 ---------------------------------------
  await page.goBack();
  await expect(page).toHaveURL(/\/receipts$/);
  await expect(page.locator(".pager-status")).toContainText("第 1 /");

  // --- search runs server-side across everything, and resets to page 1 -------
  await page.goto("/receipts?page=2");
  await page.getByPlaceholder("搜尋收據編號、付款人或項目").fill("分頁測試獨特付款人");
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(page).not.toHaveURL(/[?&]page=2/);
  await expect(page.locator(".dtable tbody tr")).toHaveCount(1);
  await expect(page.locator(".dtable tbody")).toContainText("獨一無二的顧問項目");

  // --- a reload keeps the search --------------------------------------------
  await page.reload();
  await expect(page.getByPlaceholder("搜尋收據編號、付款人或項目")).toHaveValue("分頁測試獨特付款人");
  await expect(page.locator(".dtable tbody tr")).toHaveCount(1);

  // --- a filter with no matches shows "no results", not "never created" ------
  await page.goto("/receipts?status=pending&q=分頁測試獨特付款人");
  await expect(page.locator(".empty-title")).toHaveText("找不到符合條件的資料");

  // --- clearing conditions returns the full list ------------------------------
  await page.getByRole("button", { name: "清除搜尋與篩選" }).click();
  await expect(page).toHaveURL(/\/receipts$/);
  await expect(page.locator(".dtable tbody tr")).toHaveCount(20);

  // --- status filter is server-side and shown in the URL ---------------------
  await page.getByLabel("收款狀態").selectOption("paid");
  await expect(page).toHaveURL(/[?&]status=paid/);
  await expect(page.locator(".dtable tbody tr").first()).toContainText("已收款");
});
