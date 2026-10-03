import { test, expect } from "@playwright/test";
test("deck library, London mulligan, correction, undo and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A seat at the table." }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/lobby-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Deck library 12" }).click();
  await expect(page.locator(".deck-tile")).toHaveCount(12);
  await page.getByRole("button", { name: "View deck" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Find a card").fill("Basalt");
  await expect(page.locator(".deck-card-list summary")).toHaveCount(1);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByLabel("Who plays first?").selectOption("you");
  await page.getByRole("button", { name: "Shuffle up & play" }).click();
  await expect(page.locator(".hand-cards .text-card")).toHaveCount(7);
  await page.getByRole("button", { name: "Mulligan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Keep 6" })).toBeDisabled();
  await page.locator(".hand-cards .text-card").first().click();
  await page.getByRole("button", { name: "Keep 6" }).click();
  await expect(page.locator(".hand-cards .text-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Edit state", exact: true }).click();
  await page
    .getByRole("group", { name: "You", exact: true })
    .getByLabel("Life", { exact: true })
    .fill("35");
  await page.getByRole("button", { name: "Apply correction" }).click();
  await expect(page.locator(".life-total strong").last()).toHaveText("35");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".life-total strong").last()).toHaveText("40");
  await page.reload();
  await expect(page.locator(".hand-cards .text-card")).toHaveCount(6);
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/table-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("AI connection, response window, failure and completed game using a stub provider", async ({
  page,
}) => {
  await page.route("**/api/status", (r) =>
    r.fulfill({ json: { serverKey: false, accessTokenRequired: false } }),
  );
  let requests = 0;
  await page.route("**/api/play", async (route) => {
    const body = route.request().postDataJSON();
    requests++;
    if (requests === 1) {
      await route.fulfill({
        status: 400,
        json: { error: "OpenRouter credits are exhausted." },
      });
      return;
    }
    const g = body.game;
    if (body.action.includes("Pass")) {
      g.priority = "you";
      g.status = "finished";
      g.winner = "you";
      g.reason = "Opponent conceded.";
    }
    g.log.push({
      id: "test-log",
      turn: 1,
      actor: "system",
      text: "Opponent conceded.",
    });
    await route.fulfill({ json: { game: g } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect AI", exact: true }).click();
  await page
    .getByLabel("OpenRouter API key", { exact: true })
    .fill("test-key-never-save");
  await page.getByRole("button", { name: "Save connection" }).click();
  await page.getByLabel("Who plays first?").selectOption("you");
  await page.getByRole("button", { name: "Shuffle up & play" }).click();
  await page.getByRole("button", { name: "Keep 7" }).click();
  await page
    .getByRole("button", { name: "Pass priority", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("credits are exhausted");
  await expect(page.locator(".life-total strong").last()).toHaveText("40");
  await page
    .getByRole("button", { name: "Pass priority", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The table is yours." }),
  ).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain("test-key-never-save");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The table is yours." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect AI", exact: true }),
  ).toBeVisible();
});
test("mobile layout remains usable without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/lobby-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Who plays first?").selectOption("you");
  await page.getByRole("button", { name: "Shuffle up & play" }).click();
  await page.getByRole("button", { name: "Keep 7" }).click();
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/table-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".hand-cards .text-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("real development proxy accepts same-origin browser API requests", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // Invalid input verifies routing without invoking a paid provider request.
    const response = await fetch("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return { status: response.status, body: await response.json() };
  });
  expect(result.status).toBe(400);
  expect(result.body.error).toContain("validation");
  const rejected = await page.request.get("/api/status", {
    headers: { Origin: "https://unrelated.example" },
  });
  expect(rejected.status()).toBe(403);
});

test("starts and saves a game when randomUUID is unavailable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto("/");
  await page.getByLabel("Who plays first?").selectOption("you");
  await page.getByRole("button", { name: "Shuffle up & play" }).click();
  await expect(page.locator(".hand-cards .text-card")).toHaveCount(7);
  await page.getByRole("button", { name: "Keep 7" }).click();
  await page.reload();
  await expect(page.locator(".hand-cards .text-card")).toHaveCount(7);
  expect(errors).toEqual([]);
});

test("tablet casting previews mana, submits the card and shows a tapped source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.route("**/api/status", (r) =>
    r.fulfill({ json: { serverKey: false, accessTokenRequired: false } }),
  );
  await page.goto("/");
  await page.getByLabel("Who plays first?").selectOption("you");
  await page.getByRole("button", { name: "Shuffle up & play" }).click();
  await page.getByRole("button", { name: "Keep 7" }).click();
  const ids = await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem("chatedh-game-v1")!);
    g.turn = 3;
    g.phase = "Main 1";
    const source = g.cards.find(
      (c: any) => c.owner === "you" && c.name === "Sol Ring",
    );
    const spell = g.cards.find(
      (c: any) => c.owner === "you" && c.name === "Arcane Signet",
    );
    const island = g.cards.find(
      (c: any) => c.owner === "you" && c.name === "Island",
    );
    source.zone = "battlefield";
    island.zone = "battlefield";
    spell.zone = "hand";
    localStorage.setItem("chatedh-game-v1", JSON.stringify(g));
    return { source: source.id, spell: spell.id, island: island.id };
  });
  await page.reload();
  await expect(page.getByLabel("Auto-tap mana")).toBeChecked();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page.getByLabel("AI autoplay", { exact: true }).uncheck();
  await page.getByLabel("Auto-pass when no legal actions").uncheck();
  await page.getByRole("tab", { name: "Stack 0" }).click();
  await page.getByRole("button", { name: "Connect AI", exact: true }).click();
  await page.getByLabel("OpenRouter API key", { exact: true }).fill("test-key");
  await page.getByRole("button", { name: "Save connection" }).click();
  let castRequest: any;
  await page.route("**/api/play", async (route) => {
    const body = route.request().postDataJSON();
    castRequest = body;
    const g = body.game;
    g.cards.find((c: any) => c.id === ids.source).tapped = true;
    g.cards.find((c: any) => c.id === ids.spell).zone = "stack";
    g.stack = [
      {
        id: "cast-signet",
        cardId: ids.spell,
        label: "Arcane Signet",
        controller: "you",
        details: "Artifact spell",
      },
    ];
    g.priority = "ai";
    g.prompt = "Opponent may respond.";
    g.log.push({
      id: "test-cast",
      turn: 3,
      actor: "you",
      text: "Cast Arcane Signet. Auto-tap: Tap Sol Ring → {C}{C}",
    });
    await route.fulfill({ json: { game: g } });
  });
  await page
    .locator(".hand-cards .text-card")
    .filter({ hasText: "Arcane Signet" })
    .click();
  await expect(page.locator(".mana-preview")).toContainText("Tap Sol Ring");
  await expect(page.locator(".mana-preview")).not.toContainText("Tap Island");
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/cast-tablet.png",
  });
  await page.getByRole("button", { name: "Cast with auto-tap" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".priority-banner")).toContainText(
    "Opponent has priority",
  );
  expect(castRequest.autoTap).toBe(true);
  expect(castRequest.cast).toEqual({ cardId: ids.spell, xValue: 0 });
  await expect(
    page.locator(".text-card.tapped").filter({ hasText: "Sol Ring" }),
  ).toHaveCount(1);
  await expect(page.locator(".stack-item")).toContainText("Arcane Signet");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/table-tablet-landscape.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect(page.getByRole("log")).toContainText("Auto-tap: Tap Sol Ring");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/table-tablet-portrait.png",
    fullPage: true,
  });
});
