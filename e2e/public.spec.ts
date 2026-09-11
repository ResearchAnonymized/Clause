import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("privacy notice uses the legal frame", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /privacy notice/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /theme/i })).toBeVisible();
  });

  test("auth page offers sign-in", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("tab", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /theme/i })).toBeVisible();
  });
});
