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
