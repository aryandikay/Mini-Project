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
  await expect(
    page.getByRole("status").filter({ hasText: "confirmed:" }),
  ).toContainText("confirmed:");
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

test("full lifecycle: reschedule, preserve failed proposal, schedule and dashboard refresh, cancellation confirmation", async ({
  page,
}) => {
  await page.goto("/clients");
  await page.getByLabel("Client name").fill("Lifecycle browser client");
  await page.getByRole("button", { name: "Add client", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Lifecycle browser client" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create request" }).click();
  await page
    .getByLabel("Client", { exact: true })
    .selectOption({ label: "Lifecycle browser client" });
  await page.getByLabel("Event name").fill("Lifecycle browser event");
  await page.getByLabel("Event date").fill("2099-04-01");
  await page.getByLabel("Start time").fill("10:00");
  await page.getByLabel("End time").fill("12:00");
  await page.getByLabel("Attendees").fill("120");
  await page.getByLabel("Preferred venue").selectOption({ label: "Venue A" });
  await page.getByRole("button", { name: "Submit event request" }).click();
  await page.getByRole("link", { name: "Lifecycle browser event" }).click();
  await expect(
    page.getByText("Venue A · Hall A2", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reschedule booking", exact: true })
    .click();
  await expect(page.getByLabel("Event date")).toHaveValue("2099-04-01");
  await page.getByLabel("Event date").fill("2099-04-02");
  await page.getByLabel("Preferred venue").selectOption({ label: "Venue B" });
  await page.getByRole("button", { name: "Save reschedule" }).click();
  await expect(
    page.getByText("Venue B · Hall B2", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Booking rescheduled");
  await page
    .getByRole("button", { name: "Reschedule booking", exact: true })
    .click();
  await page.getByLabel("Attendees").fill("999");
  await page.getByRole("button", { name: "Save reschedule" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "original booking is unchanged",
  );
  await expect(
    page.getByText("Venue B · Hall B2", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Attendees")).toHaveValue("999");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await page.getByRole("link", { name: "Schedule", exact: true }).click();
  await page.getByLabel("Schedule date").fill("2099-04-01");
  await expect(
    page.getByRole("link", { name: "Lifecycle browser event" }),
  ).toHaveCount(0);
  await page.getByLabel("Schedule date").fill("2099-04-02");
  await expect(
    page.getByRole("link", { name: "Lifecycle browser event" }),
  ).toBeVisible();
  await expect(page.getByText("Hall B2 · 10:00 – 12:00")).toBeVisible();
  await page.getByRole("link", { name: "Lifecycle browser event" }).click();
  await page
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep booking" }).click();
  await expect(
    page.locator(".badge").filter({ hasText: "Confirmed" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(
    page.locator(".badge").filter({ hasText: "Cancelled" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel booking", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator(".badge").filter({ hasText: "Cancelled" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Schedule", exact: true }).click();
  await page.getByLabel("Schedule date").fill("2099-04-02");
  await expect(
    page.getByRole("heading", { name: "No confirmed events" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.locator(".stat").filter({ hasText: "Cancelled" }).locator("strong"),
  ).toHaveText("1");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

async function rejectedRecommendationFixture(page, date, name) {
  const client = (
    await (
      await page.request.post("/api/clients", {
        data: { name: `Client ${name}` },
      })
    ).json()
  ).data;
  const original = {
    clientId: client.id,
    eventName: name,
    eventDate: date,
    startTime: "10:00",
    endTime: "12:00",
    attendees: 250,
    preferredVenueId: 3,
    projectorsRequired: 1,
    audioRequired: 1,
    staffRequired: 1,
  };
  await page.request.post("/api/bookings", {
    data: { ...original, eventName: "Recommendation blocker" },
  });
  await page.goto("/new");
  await page
    .getByLabel("Client", { exact: true })
    .selectOption(String(client.id));
  await page.getByLabel("Event name").fill(name);
  await page.getByLabel("Event date").fill(date);
  await page.getByLabel("Start time").fill("10:00");
  await page.getByLabel("End time").fill("12:00");
  await page.getByLabel("Attendees").fill("250");
  await page.getByLabel("Preferred venue").selectOption("3");
  await page.getByLabel("Projectors", { exact: true }).fill("1");
  await page.getByLabel("Audio systems", { exact: true }).fill("1");
  await page.getByLabel("Support staff", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Submit event request" }).click();
  const card = page
    .locator(".request-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card.locator(".badge")).toContainText("Rejected");
  await card.getByRole("link", { name: "Find alternatives" }).click();
  return original;
}
test("recommendation UI searches and confirms a new booking while preserving rejected history", async ({
  page,
}) => {
  await rejectedRecommendationFixture(
    page,
    "2099-08-01",
    "Alternative browser event",
  );
  const originalUrl = page.url();
  await page
    .getByRole("button", { name: "Search alternatives", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Option 1: Venue C · Hall C2" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Alternative recommendations" }),
  ).toContainText("13:00 – 15:00");
  await page
    .getByRole("button", { name: "Select option 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm alternative", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "New booking #" }),
  ).toContainText("confirmed: Venue C · Hall C2");
  await page.getByRole("link", { name: /View new request/ }).click();
  await expect(page.locator(".badge")).toContainText("Confirmed");
  await expect(page.locator(".request-card")).toContainText("13:00 – 15:00");
  expect(page.url()).not.toBe(originalUrl);
  await page.goto(originalUrl);
  await expect(page.locator(".badge")).toContainText("Rejected");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Search alternatives", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select option 1", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("recommendation confirmation revalidates changed availability and permits refresh", async ({
  page,
}) => {
  const original = await rejectedRecommendationFixture(
    page,
    "2099-09-01",
    "Stale alternative",
  );
  await page
    .getByRole("button", { name: "Search alternatives", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select option 1", exact: true })
    .click();
  const taken = await page.request.post("/api/bookings", {
    data: {
      ...original,
      eventName: "Concurrent taker",
      startTime: "13:00",
      endTime: "15:00",
    },
  });
  expect((await taken.json()).data.status).toBe("CONFIRMED");
  await page
    .getByRole("button", { name: "Confirm alternative", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Availability changed");
  await expect(page.locator(".badge")).toContainText("Rejected");
  await page
    .getByRole("button", { name: "Search alternatives", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select option 1", exact: true }),
  ).toBeVisible();
});
test("recommendation empty state and network error recovery", async ({
  page,
}) => {
  const client = (
    await (
      await page.request.post("/api/clients", {
        data: { name: "No alternatives" },
      })
    ).json()
  ).data;
  const rejected = (
    await (
      await page.request.post("/api/bookings", {
        data: {
          clientId: client.id,
          eventName: "Impossible demand",
          eventDate: "2099-10-01",
          startTime: "10:00",
          endTime: "12:00",
          attendees: 999,
          preferredVenueId: 1,
          projectorsRequired: 0,
          audioRequired: 0,
          staffRequired: 0,
        },
      })
    ).json()
  ).data;
  await page.goto(`/bookings/${rejected.id}`);
  await page.route("**/api/recommendations", (route) => route.abort());
  await page
    .getByRole("button", { name: "Search alternatives", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Unable to reach");
  await page.unroute("**/api/recommendations");
  await page
    .getByRole("button", { name: "Search alternatives", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "No feasible alternatives found",
  );
  await expect(page.getByRole("button", { name: /Select option/ })).toHaveCount(
    0,
  );
});
