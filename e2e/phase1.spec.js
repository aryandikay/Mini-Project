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

async function apiData(page, route, body) {
  const response = body === undefined
    ? await page.request.get(`/api${route}`)
    : await page.request.post(`/api${route}`, { data: body });
  expect(response.ok()).toBe(true);
  return (await response.json()).data;
}
async function recommendationFixture(page, prefix, eventDate) {
  const client = await apiData(page, "/clients", { name: prefix });
  const venues = await apiData(page, "/venues");
  return { clientId: client.id, eventName: prefix, eventDate, startTime: "10:00", endTime: "12:00",
    attendees: 250, preferredVenueId: venues.find((v) => v.name === "Venue C").id,
    projectorsRequired: 1, audioRequired: 1, staffRequired: 2 };
}

test("rejected request finds real alternatives, handles stale venue, confirms once and preserves history", async ({ page }) => {
  await page.goto("/");
  const input = await recommendationFixture(page, "Phase 4 rejected event", "2098-04-01");
  await apiData(page, "/bookings", { ...input, eventName: "All-day constraint", startTime: "08:30", endTime: "21:30" });
  // Exercise the actual request form and its persisted-rejection navigation.
  await page.goto("/new");
  await page.getByLabel("Client", { exact: true }).selectOption(String(input.clientId));
  await page.getByLabel("Event name").fill(input.eventName);
  await page.getByLabel("Event date").fill(input.eventDate);
  await page.getByLabel("Start time").fill(input.startTime);
  await page.getByLabel("End time").fill(input.endTime);
  await page.getByLabel("Attendees").fill("250");
  await page.getByLabel("Preferred venue").selectOption(String(input.preferredVenueId));
  await page.getByLabel("Projectors", { exact: true }).fill("1");
  await page.getByLabel("Audio systems", { exact: true }).fill("1");
  await page.getByLabel("Support staff", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Submit event request" }).click();
  const card = page.locator(".request-card").filter({ has: page.getByRole("link", { name: input.eventName, exact: true }) });
  await card.getByRole("link", { name: "Find alternatives" }).click();
  const rejectedId = Number(page.url().split("/").at(-1));
  const original = await apiData(page, `/bookings/${rejectedId}`);
  expect(original.status).toBe("REJECTED");
  const panel = page.getByRole("region", { name: "Alternative recommendations" });
  await panel.getByRole("button", { name: "Find alternatives", exact: true }).click();
  await expect(panel.getByText("No feasible alternatives found", { exact: false })).toBeVisible();
  await panel.getByLabel("Search dates").selectOption("7");
  await panel.getByRole("button", { name: "Refresh alternatives" }).click();
  const first = panel.locator(".request-card").first();
  await expect(first).toContainText("2098-04-02");
  await expect(first).toContainText("10:00 – 12:00");
  await expect(first).toContainText("snapshot");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("recommendations-results-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await apiData(page, "/bookings", { ...input, eventName: "Concurrent competitor", eventDate: "2098-04-02" });
  await first.getByRole("button", { name: "Confirm this alternative" }).click();
  await expect(panel.getByRole("alert")).toContainText("no longer available");
  expect(await apiData(page, `/bookings/${rejectedId}`)).toEqual(original);
  await panel.getByRole("button", { name: "Refresh alternatives" }).click();
  await expect(first).toContainText("2098-04-03");
  const before = (await apiData(page, "/bookings")).length;
  await first.getByRole("button", { name: "Confirm this alternative" }).click();
  await expect(page).not.toHaveURL(new RegExp(`/bookings/${rejectedId}$`));
  await expect(page.locator(".badge")).toHaveText(/Confirmed/);
  const rows = await apiData(page, "/bookings");
  expect(rows.length).toBe(before + 1);
  expect(rows.find((b) => b.id === rejectedId)).toEqual(original);
  const confirmedId = Number(page.url().split("/").at(-1));
  const confirmed = rows.find((b) => b.id === confirmedId);
  expect(confirmed.eventDate).toBe("2098-04-03");
  expect(confirmed.allocatedVenueId).toBe(input.preferredVenueId);
  await page.getByRole("link", { name: "Schedule", exact: true }).click();
  await page.getByLabel("Schedule date").fill(confirmed.eventDate);
  await expect(page.getByRole("link", { name: input.eventName, exact: true })).toBeVisible();
});

test("recommendation loading, network error, empty range and mobile layout", async ({ page }) => {
  await page.goto("/");
  const input = await recommendationFixture(page, "Phase 4 impossible event", "2097-04-01");
  const rejected = await apiData(page, "/bookings", { ...input, attendees: 999 });
  await page.goto(`/bookings/${rejected.id}`);
  const panel = page.getByRole("region", { name: "Alternative recommendations" });
  await page.route("**/api/recommendations", (route) => route.abort());
  await panel.getByRole("button", { name: "Find alternatives", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Unable to reach EventSync");
  await page.unroute("**/api/recommendations");
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/recommendations", async (route) => { await gate; await route.continue(); });
  await panel.getByRole("button", { name: "Find alternatives", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Searching available alternatives");
  await expect(panel.getByRole("button", { name: "Searching…", exact: true })).toBeDisabled();
  release();
  await expect(panel.getByText("No feasible alternatives found", { exact: false })).toBeVisible();
  await page.unroute("**/api/recommendations");
  await panel.getByLabel("Search dates").selectOption("7");
  await panel.getByRole("button", { name: "Refresh alternatives" }).click();
  await expect(panel).toContainText("through 2097-04-07");
  await expect(panel.getByText("No feasible alternatives found", { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("recommendations-mobile.png"), fullPage: true });
});

test("failed reschedule searches trusted alternatives and atomically applies selection", async ({ page }) => {
  await page.goto("/");
  const input = await recommendationFixture(page, "Phase 4 reschedule event", "2096-04-01");
  const original = await apiData(page, "/bookings", input);
  await apiData(page, "/bookings", { ...input, eventDate: "2096-04-02", startTime: "08:30", endTime: "21:30" });
  await page.goto(`/bookings/${original.id}`);
  await page.getByRole("button", { name: "Reschedule booking", exact: true }).click();
  await page.getByLabel("Event date").fill("2096-04-02");
  await page.getByRole("button", { name: "Save reschedule" }).click();
  await expect(page.getByRole("alert")).toContainText("original booking is unchanged");
  expect(await apiData(page, `/bookings/${original.id}`)).toEqual(original);
  const panel = page.getByRole("region", { name: "Alternative recommendations" });
  await panel.getByLabel("Search dates").selectOption("7");
  await panel.getByRole("button", { name: "Find alternatives", exact: true }).click();
  await expect(panel.locator(".request-card").first()).toContainText("2096-04-03");
  await panel.getByRole("button", { name: "Reschedule to this alternative" }).first().click();
  await expect(page.getByRole("status")).toContainText("Booking rescheduled");
  const updated = await apiData(page, `/bookings/${original.id}`);
  expect(updated.id).toBe(original.id); expect(updated.eventDate).toBe("2096-04-03");
  expect(updated.status).toBe("CONFIRMED"); expect(updated.attendees).toBe(original.attendees);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("resource dashboard shows real peaks, buffered timeline, filters and booking navigation", async ({ page }) => {
  await page.goto("/");
  const input = { ...await recommendationFixture(page, "Phase 5 conference", "2094-05-01"), preferredVenueId: 1, attendees: 120 };
  const a = await apiData(page, "/bookings", input);
  await apiData(page, "/bookings", { ...input, eventName: "Phase 5 parallel workshop", attendees: 50, staffRequired: 3 });
  await page.goto("/");
  await page.getByRole("link", { name: "Resource intelligence & timeline", exact: false }).click();
  await page.getByLabel("Resource date").fill(input.eventDate);
  await expect(page.getByRole("heading", { name: "Venue A · 2094-05-01" })).toBeVisible();
  const projectors = page.getByRole("article", { name: "Projectors metrics" });
  await expect(projectors).toContainText("Daily peak: 2");
  await page.getByLabel("Inspect time").fill("09:30");
  await expect(projectors).toContainText("In use at 09:30: 2 · Available: 0");
  await page.getByLabel("Inspect time").fill("12:30");
  await expect(projectors).toContainText("In use at 12:30: 0 · Available: 2");
  const timeline = page.getByRole("region", { name: "Reservation and resource timeline" });
  await expect(timeline.getByRole("img", { name: "Hall A2 buffered reservations" })).toBeVisible();
  await expect(timeline.getByRole("img", { name: "Support staff concurrent usage" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("resource-dashboard-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath("resource-dashboard-desktop.png"), fullPage: true });
  await timeline.getByRole("link", { name: /Phase 5 conference,/ }).click();
  await expect(page).toHaveURL(`/bookings/${a.id}`);
  await page.goto("/resources");
  await page.getByLabel("Resource date").fill(input.eventDate);
  await page.getByLabel("Resource venue").selectOption("2");
  await expect(page.getByText("No confirmed reservations for this venue and date.", { exact: false })).toBeVisible();
  await page.getByLabel("Resource venue").selectOption("1");
  await page.getByLabel("Resource date").fill("2094-05-02");
  await expect(page.getByText("No confirmed reservations for this venue and date.", { exact: false })).toBeVisible();
});

test("new what-if simulation is read-only, explains conflicts and creates through protected booking API", async ({ page }) => {
  await page.goto("/");
  const input = await recommendationFixture(page, "Phase 5 hypothetical", "2093-05-01");
  await page.goto("/simulation");
  await page.getByLabel("Proposed date").fill(input.eventDate);
  await page.getByLabel("Proposed attendees").fill("251");
  const before = await apiData(page, "/bookings");
  await page.getByRole("button", { name: "Simulate proposal" }).click();
  const result = page.getByRole("region", { name: "Simulation result" });
  await expect(result.getByRole("heading", { name: "Proposal is not feasible", exact: true })).toBeVisible();
  await expect(result).toContainText("No hall seats 251 attendees");
  expect(await apiData(page, "/bookings")).toEqual(before);
  await page.getByLabel("Proposed attendees").fill("50");
  await page.getByRole("button", { name: "Simulate proposal" }).click();
  await expect(result.getByRole("heading", { name: "Proposal is feasible", exact: true })).toBeVisible();
  await expect(result).toContainText("Hall A1");
  expect(await apiData(page, "/bookings")).toEqual(before);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("simulation-mobile.png"), fullPage: true });
  await page.getByLabel("Client for confirmation").selectOption(String(input.clientId));
  await page.getByLabel("Event name for confirmation").fill("Applied what-if event");
  const confirmationRequest = page.waitForRequest((r) => r.url().endsWith("/api/bookings") && r.method() === "POST");
  await page.getByRole("button", { name: "Create booking from proposal" }).click();
  expect((await confirmationRequest).postDataJSON().selectedVenueId).toBe(1);
  await expect(page.locator(".badge")).toHaveText(/Confirmed/);
  expect((await apiData(page, "/bookings")).length).toBe(before.length + 1);
});

test("existing what-if preserves original, rejects stale apply and applies refreshed proposal atomically", async ({ page }) => {
  await page.goto("/");
  const input = { ...await recommendationFixture(page, "Phase 5 moved event", "2092-05-01"), preferredVenueId: 1, attendees: 120 };
  const original = await apiData(page, "/bookings", input);
  await page.goto(`/bookings/${original.id}`);
  await page.getByRole("link", { name: "Explore a what-if change" }).click();
  await expect(page.getByLabel("Proposed date")).toHaveValue(input.eventDate);
  await page.getByLabel("Proposed attendees").fill("999");
  await page.getByRole("button", { name: "Simulate proposal" }).click();
  await expect(page.getByRole("heading", { name: "Proposal is not feasible", exact: true })).toBeVisible();
  expect(await apiData(page, `/bookings/${original.id}`)).toEqual(original);
  await page.getByLabel("Proposed attendees").fill("120");
  await page.getByLabel("Proposed date").fill("2092-05-02");
  await page.getByRole("button", { name: "Simulate proposal" }).click();
  await expect(page.getByRole("heading", { name: "Proposal is feasible", exact: true })).toBeVisible();
  expect(await apiData(page, `/bookings/${original.id}`)).toEqual(original);
  await apiData(page, "/bookings", { ...input, eventName: "Simulation competitor", eventDate: "2092-05-02" });
  await page.getByRole("button", { name: "Apply proposed reschedule" }).click();
  await expect(page.getByRole("alert")).toContainText("no longer available");
  expect(await apiData(page, `/bookings/${original.id}`)).toEqual(original);
  await page.getByLabel("Proposed date").fill("2092-05-03");
  await page.getByRole("button", { name: "Simulate proposal" }).click();
  await expect(page.getByRole("heading", { name: "Proposal is feasible", exact: true })).toBeVisible();
  const applyRequest = page.waitForRequest((r) => r.url().endsWith(`/api/bookings/${original.id}/reschedule`) && r.method() === "PATCH");
  await page.getByRole("button", { name: "Apply proposed reschedule" }).click();
  expect((await applyRequest).postDataJSON().expectedUpdatedAt).toBe(original.updatedAt);
  await expect(page).toHaveURL(`/bookings/${original.id}`);
  const updated = await apiData(page, `/bookings/${original.id}`);
  expect(updated.eventDate).toBe("2092-05-03"); expect(updated.id).toBe(original.id);
});

test("intelligence loading, API failure recovery and stale simulation token are visible", async ({ page }) => {
  await page.goto("/");
  await page.route("**/api/analytics/resources?**", (route) => route.abort());
  await page.getByRole("link", { name: "Resources", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to reach EventSync");
  await page.unroute("**/api/analytics/resources?**");
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/analytics/resources?**", async (route) => { await gate; await route.continue(); });
  await page.getByRole("button", { name: "Refresh resources" }).click();
  await expect(page.getByRole("status")).toContainText("Loading resource intelligence");
  release();
  await expect(page.getByRole("heading", { name: "Availability timeline" })).toBeVisible();
  await page.unroute("**/api/analytics/resources?**");
  const input = { ...await recommendationFixture(page, "Phase 5 stale token", "2091-05-01"), attendees: 120, preferredVenueId: 1 };
  const original = await apiData(page, "/bookings", input);
  await page.goto(`/simulation?bookingId=${original.id}`);
  await expect(page.getByLabel("Proposed date")).toHaveValue(input.eventDate);
  await page.request.patch(`/api/bookings/${original.id}/reschedule`, { data: { eventDate: "2091-05-02", expectedUpdatedAt: original.updatedAt } });
  await page.getByRole("button", { name: "Simulate proposal" }).click();
  await expect(page.getByRole("alert")).toContainText("booking changed");
  await page.getByRole("button", { name: "Reload original booking" }).click();
  await expect(page.getByLabel("Proposed date")).toHaveValue("2091-05-02");
  await page.route("**/api/simulation", (route) => route.abort());
  await page.getByRole("button", { name: "Simulate proposal" }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to reach EventSync");
  await page.unroute("**/api/simulation");
  let finish;
  const simulated = new Promise((resolve) => { finish = resolve; });
  await page.route("**/api/simulation", async (route) => { await simulated; await route.continue(); });
  await page.getByRole("button", { name: "Simulate proposal" }).click();
  await expect(page.getByRole("status")).toContainText("Evaluating current reservations");
  finish();
  await expect(page.getByRole("heading", { name: "Proposal is feasible", exact: true })).toBeVisible();
});
