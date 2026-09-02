import { expect, type Page } from "@playwright/test";

import { owner } from "./global-setup";

/** Signs in through the real form, which is also flow A's first step. */
export async function signIn(page: Page, person = owner) {
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(person.email);
  await page.getByLabel("密碼", { exact: true }).fill(person.password);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Confirms the currently open confirmation dialog by its button label. */
export async function confirmDialog(page: Page, label: string) {
  const dialog = page.locator("dialog.modal[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: label }).click();
  await expect(dialog).toBeHidden();
}

/** Fills one field of a line-item card by its visible label. */
export async function fillLine(page: Page, label: string, value: string) {
  await page.locator(".line-card").first().getByLabel(label, { exact: true }).fill(value);
}

/** The status badge shown next to a detail page's title. */
export function statusBadge(page: Page) {
  return page.locator(".page-title-row .badge").first();
}

/** Leaves the app the way a user does, from the header. */
export async function signOut(page: Page) {
  await page.locator(".shell-signout").click();
  await expect(page).toHaveURL(/\/login$/);
}

/**
 * Creates a draft quote through the editor and leaves the browser on its detail
 * page. `customer` picks the option whose label contains it; omitted, the first
 * saved customer is used.
 */
export async function createQuote(
  page: Page,
  { customer, name, unitPrice }: { customer?: string; name: string; unitPrice: string },
) {
  await page.goto("/quotes/new");
  const select = page.getByLabel("選擇客戶");
  if (customer) {
    // Option labels carry a contact suffix, so match on the value behind the text.
    const value = await select.locator("option", { hasText: customer }).first().getAttribute("value");
    await select.selectOption(value ?? "");
  } else {
    await select.selectOption({ index: 1 });
  }
  await expect(select).not.toHaveValue("");
  await fillLine(page, "名稱", name);
  await fillLine(page, "數量", "1");
  await fillLine(page, "單價（HKD）", unitPrice);
  await fillLine(page, "折扣（HKD）", "0");
  await page.getByRole("button", { name: "儲存為草稿" }).click();
  await expect(page).toHaveURL(/\/quotes\/[a-f\d]{24}$/);
}

/** `HKD 12,345.00` → `12345`. */
export function amountOf(text: string) {
  return Number((text.match(/[\d,]+\.\d{2}/)?.[0] ?? "0").replaceAll(",", ""));
}

/** The workspace's running income total, as the dashboard reports it. */
export async function dashboardIncome(page: Page) {
  await page.goto("/dashboard");
  const value = page.locator(".stat").filter({ hasText: "累計收入" }).locator(".stat-value");
  await expect(value).toBeVisible();
  return amountOf(((await value.textContent()) ?? "").trim());
}

/**
 * The document number in a detail page's title, once the page has finished
 * loading. While it loads the title is the section name ("請款單"), so reading
 * it straight after navigation races the fetch.
 */
export async function documentNumber(page: Page, prefix: string) {
  const title = page.locator(".page-title");
  await expect(title).toHaveText(new RegExp(`^${prefix}-`));
  return ((await title.textContent()) ?? "").trim();
}
