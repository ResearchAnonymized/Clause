import { expect, test } from "@playwright/test";

/**
 * Full product smoke: sign up → load sample packs → start analysis → wait for a report.
 *
 * Not run in CI (needs an LLM key and several minutes). Locally:
 *   AI_API_KEY=... PLAYWRIGHT_FULL=1 pnpm test:e2e:full
 */
test.describe("sample-pack analysis", () => {
  test("loads samples and produces a completed run with a scored report", async ({ page }) => {
    test.setTimeout(10 * 60_000);
    test.skip(!process.env.PLAYWRIGHT_FULL, "Set PLAYWRIGHT_FULL=1 to run the live analysis smoke.");
    test.skip(!process.env.AI_API_KEY, "Set AI_API_KEY so the analysis pipeline can call a model.");

    const email = `playwright.${Date.now()}@example.test`;
    const password = "Playwright-pass-10";

    await page.goto("/auth?tab=signup");
    await expect(page.getByRole("tab", { name: /create account/i })).toBeVisible();
    await page.getByRole("tab", { name: /create account/i }).click();
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await page.getByLabel(/full name/i).fill("Playwright Reviewer");
    await page.getByLabel(/work email/i).fill(email);
    await page.getByLabel(/^password$/i).last().fill(password);
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL(/\/(dashboard|runs)/, { timeout: 30_000 });

    await page.goto("/runs/new");
    await expect(page.getByRole("heading", { name: /new analysis/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Playwright Reviewer/i }).first()).toBeVisible();
    await page.getByRole("button", { name: /load sample packs/i }).click();
    await expect(page.getByText(/invitation-to-tender|tender/i).first()).toBeVisible({ timeout: 15_000 });

    const start = page.getByRole("button", { name: /^start analysis$/i });
    await expect(start).toBeEnabled({ timeout: 30_000 });
    await start.click();
    await expect(page.getByRole("button", { name: /unpacking/i })).toBeVisible({ timeout: 15_000 });

    const failedToast = page.locator("[data-sonner-toast]").filter({
      hasText: /could not|failed to start|missing ai|no active workspace|pick a criteria|upload|unauthorized|forbidden|ENOENT/i,
    });
    await Promise.race([
      page.waitForURL(/\/runs\/[0-9a-f-]+/i, { timeout: 9 * 60_000 }),
      failedToast.first().waitFor({ state: "visible", timeout: 9 * 60_000 }).then(async () => {
        throw new Error((await failedToast.first().innerText()).trim());
      }),
    ]);

    await expect(page.getByText(/completed|report|gap|aligned|partial/i).first()).toBeVisible({
      timeout: 8 * 60_000,
    });

    const report = page.getByRole("link", { name: /report/i }).first();
    if (await report.isVisible()) {
      await report.click();
      await expect(page.getByText(/do not sign|negotiate|safe to sign|score/i).first()).toBeVisible({
        timeout: 30_000,
      });
    }
  });
});
