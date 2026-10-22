import { expect, test } from "@playwright/test";

/** Local Mailpit (compose.dev.yaml) — used to read the e-mailed one-time code. */
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:6980";

async function latestCode(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const list = (await res.json()) as { messages?: { ID: string; Subject: string }[] };
    const m = list.messages?.find((x) => /recruitment code/.test(x.Subject));
    if (m) return /^(\d{6})/.exec(m.Subject)![1]!;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No code e-mail for ${to}`);
}

test("public pages render with accessible landmarks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await page.goto("/vacancies");
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

test("candidate registers, verifies the e-mail with a code and signs in", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("E2E Candidate");
  await page.getByLabel("E-mail address").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("a long e2e pass phrase");
  await page.getByLabel("Confirm password").fill("a long e2e pass phrase");
  await page.getByLabel(/privacy notice/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
  await page.getByLabel("6-digit code").fill(await latestCode(email));
  await page.getByRole("button", { name: "Verify e-mail address" }).click();
  await expect(page.getByText("E-mail address verified")).toBeVisible();
  await page.getByLabel("E-mail address").fill(email);
  await page.getByLabel("Password").fill("a long e2e pass phrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);
  const res = await page.goto("/staff");
  expect(res?.status()).toBe(403);
});

test("cross-origin POST is rejected", async ({ request }) => {
  const res = await request.post("/login", {
    headers: { Origin: "https://evil.example" },
    form: { email: "x", password: "y" },
  });
  // Blocked either by React Router's built-in action origin check (400) or our middleware (403).
  expect([400, 403]).toContain(res.status());
});
