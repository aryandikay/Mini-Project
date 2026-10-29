import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
let directory, apiProcess, viteProcess;
const errors = [];
async function start(args, cwd, env, url) {
  let output = "";
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Service exited: ${output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return child;
    } catch {
      /* Poll until startup or timeout. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`Service did not start: ${output}`);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
  });
}
async function startApi() {
  return start(
    ["server/src/index.js"],
    root,
    { PORT: "3101", DB_PATH: join(directory, "e2e.sqlite") },
    "http://127.0.0.1:3101/api/health",
  );
}
test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "eventsync-browser-"));
  apiProcess = await startApi();
  viteProcess = await start(
    [
      "../node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5174",
      "--strictPort",
    ],
    join(root, "client"),
    { API_PROXY_TARGET: "http://127.0.0.1:3101" },
    "http://127.0.0.1:5174",
  );
});
test.afterAll(async () => {
  await stop(viteProcess);
  await stop(apiProcess);
  if (directory) rmSync(directory, { recursive: true, force: true });
});
test("real UI client → confirmed booking → detail → restart persistence; desktop and mobile", async ({
  page,
}) => {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little planning. A great event." }),
  ).toBeVisible();
  for (const name of ["Venue A", "Venue B", "Venue C"])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  for (const hall of [
    "Hall A1",
    "Hall A2",
    "Hall B1",
    "Hall B2",
    "Hall C1",
    "Hall C2",
  ])
    await expect(page.getByText(hall, { exact: true })).toBeVisible();
  await expect(page.getByText("Your next event starts here")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("dashboard-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByLabel("Client name").fill("Browser Test Society");
  await page.getByLabel("Email (optional)").fill("browser@example.com");
  await page.getByRole("button", { name: "Add client", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser Test Society" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create request" }).click();
  await page
    .getByLabel("Client", { exact: true })
    .selectOption({ label: "Browser Test Society" });
  await page.getByLabel("Event name").fill("Campus Innovation Day");
  await page.getByLabel("Event date").fill("2027-03-20");
  await page.getByLabel("Attendees").fill("85");
  await page.getByLabel("Start time").fill("10:00");
  await page.getByLabel("End time").fill("09:00");
  await page.getByLabel("Preferred venue").selectOption({ label: "Venue B" });
  await page.getByLabel("Projectors", { exact: true }).fill("1");
  await page.getByLabel("Audio systems", { exact: true }).fill("1");
  await page.getByLabel("Support staff", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Submit event request" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "End time must be after start time.",
  );
  await page.getByLabel("End time").fill("12:00");
  await page.getByRole("button", { name: "Submit event request" }).click();
  await expect(page).toHaveURL("/bookings");
  await expect(page.getByRole("status")).toContainText("confirmed:");
  await expect(
    page.getByRole("heading", { name: "Campus Innovation Day" }),
  ).toBeVisible();
  await expect(
    page.locator(".badge").filter({ hasText: "Confirmed" }),
  ).toBeVisible();
  await expect(
    page.getByText("Venue B · Hall B1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Campus Innovation Day" }).click();
  await expect(page.getByText("09:30 – 12:30", { exact: false })).toBeVisible();
  await stop(apiProcess);
  apiProcess = await startApi();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Campus Innovation Day" }),
  ).toBeVisible();
  await expect(
    page.locator(".badge").filter({ hasText: "Confirmed" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All requests" }).click();
  await page.getByLabel("Status").selectOption("REJECTED");
  await expect(
    page.getByRole("heading", { name: "No matching requests" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Campus Innovation Day" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Venue C", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("dashboard-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "+ New event request" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByLabel("Event name")).toBeVisible();
  expect(errors).toEqual([]);
});
test("network failure is visible and retry recovers real backend data", async ({
  page,
}) => {
  await page.route("**/api/venues", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Unable to reach EventSync",
  );
  await page.unroute("**/api/venues");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Venue A", exact: true }),
  ).toBeVisible();
});

test("UI displays persisted rejection reasons", async ({ page }) => {
  await page.goto("/clients");
  await page.getByLabel("Client name").fill("Rejection client");
  await page.getByRole("button", { name: "Add client", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rejection client" }),
  ).toBeVisible();
  await page.goto("/new");
  await page
    .getByLabel("Client", { exact: true })
    .selectOption({ label: "Rejection client" });
  await page.getByLabel("Event name").fill("Too large");
  await page.getByLabel("Event date").fill("2028-01-01");
  await page.getByLabel("Attendees").fill("999");
  await page.getByLabel("Start time").fill("10:00");
  await page.getByLabel("End time").fill("12:00");
  await page.getByLabel("Preferred venue").selectOption({ label: "Venue A" });
  await page.getByRole("button", { name: "Submit event request" }).click();
  await expect(
    page.locator(".badge").filter({ hasText: "Rejected" }),
  ).toBeVisible();
  await expect(
    page.locator(".request-card").filter({ hasText: "Too large" }),
  ).toContainText("No hall seats 999");
  await page.reload();
  await expect(
    page.locator(".request-card").filter({ hasText: "Too large" }),
  ).toContainText("Not allocated");
});
