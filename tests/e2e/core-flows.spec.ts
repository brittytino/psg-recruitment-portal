import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo@12345-change";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("public pages render with vacancies and accessible landmarks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Faculty recruitment");
  await page.getByRole("link", { name: /View open vacancies/ }).click();
  await expect(page.getByRole("link", { name: /\(demo\)/ }).first()).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
});

test("anonymous users are redirected from protected pages", async ({ page }) => {
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/login\?next=%2Fstaff/);
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail address").fill("nobody@example.test");
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("The e-mail address or password is incorrect.")).toBeVisible();
});

test("candidate starts an application, edits a section and saves the draft", async ({ page }) => {
  await signIn(page, "candidate@example.test");
  await expect(page).toHaveURL(/\/account/);
  await page.goto("/vacancies/DEMO-CSE-AP");
  const start = page.getByRole("button", { name: "Start application" });
  if (await start.isVisible()) await start.click();
  else await page.getByRole("link", { name: "Continue your application" }).click();
  await expect(page.getByRole("navigation", { name: "Application sections" })).toBeVisible();
  await page.getByRole("link", { name: /Personal details/ }).click();
  await page.getByLabel(/^Name \(in block letters\)/).fill("e2e candidate");
  await expect(page.getByLabel(/^Name \(in block letters\)/)).toHaveValue("E2E CANDIDATE");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  await page.getByRole("link", { name: "Review and submit" }).first().click();
  await expect(page.getByRole("heading", { name: "Review your application" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Submit application/ })).toBeDisabled();
});

test("HR officer sees the application workspace; candidate cannot", async ({ page, browser }) => {
  await signIn(page, "hr@example.test");
  await expect(page).toHaveURL(/\/staff/);
  await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
  await expect(page.getByText("Drafts in progress")).toBeVisible();
  const ctx = await browser.newContext();
  const cand = await ctx.newPage();
  await signIn(cand, "candidate2@example.test");
  const res = await cand.goto("/staff");
  expect(res?.status()).toBe(403);
  await ctx.close();
});

test("cross-origin POST is rejected", async ({ request }) => {
  const res = await request.post("/login", { headers: { Origin: "https://evil.example" }, form: { email: "x", password: "y" } });
  // Blocked either by React Router's built-in action origin check (400) or our middleware (403).
  expect([400, 403]).toContain(res.status());
});
