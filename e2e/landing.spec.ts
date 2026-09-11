import { expect, test } from "@playwright/test";

test.describe("landing and theme", () => {
  test("renders the product mark and marketing headline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "CounterPart" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/gaps/i);
    const h1Font = await page.locator("h1").first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(h1Font).toMatch(/Garamond|EB Garamond|serif/i);
    const bodyFont = await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
    expect(bodyFont).toMatch(/Inter/i);
  });

  test("Light, Dark, and System persist on the document", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.evaluate(() => localStorage.setItem("clause.theme", "dark"));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("clause.theme"))).toBe("dark");

    await page.evaluate(() => {
      localStorage.setItem("clause.theme", "light");
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    });
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("clause.theme"))).toBe("light");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => localStorage.setItem("clause.theme", "system"));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("clause.theme"))).toBe("system");
  });
});
