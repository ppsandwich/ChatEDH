import { test, expect, type Page } from "@playwright/test";
import type { Game } from "../src/lib/game";

async function prepareTable(page: Page) {
  await page.route("**/api/status", (r) =>
    r.fulfill({ json: { serverKey: false, accessTokenRequired: false } }),
  );
  await page.goto("/");
  await page.getByLabel("Who plays first?").selectOption("you");
  await page.getByRole("button", { name: "Shuffle up & play" }).click();
  await page.getByRole("button", { name: "Keep 7" }).click();
  const game = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("chatedh-game-v1")!) as Game;
    // An upkeep with no human hand or battlefield has no playable Kinnan.
    for (const card of state.cards)
      if (card.owner === "you" && card.zone === "hand") card.zone = "library";
    localStorage.setItem("chatedh-game-v1", JSON.stringify(state));
    return state;
  });
  await page.unroute("**/api/status");
  await page.route("**/api/status", (r) =>
    r.fulfill({ json: { serverKey: true, accessTokenRequired: false } }),
  );
  return game;
}

test("automatically passes, resumes the opponent, then holds a human response window", async ({
  page,
}) => {
  await prepareTable(page);
  const requests: { actor: string; autoPass: boolean }[] = [];
  await page.route("**/api/play", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const game: Game = body.game;
    if (requests.length === 1) {
      expect(body.autoPass).toBe(true);
      expect(body.actor).toBe("you");
      game.priority = "ai";
      game.prompt = "AI priority.";
      game.log.push({
        id: "auto-pass",
        turn: game.turn,
        actor: "you",
        text: "Automatically passed priority (no legal actions).",
      });
      await route.fulfill({ json: { game, autoPassed: true } });
    } else if (requests.length === 2) {
      expect(body.actor).toBe("ai");
      game.priority = "you";
      game.prompt = "Choose how to respond to the opponent.";
      game.log.push({
        id: "ai-action",
        turn: game.turn,
        actor: "ai",
        text: "Opponent takes an action.",
      });
      await route.fulfill({ json: { game, autoPassed: false } });
    } else {
      // A read-only assessment must not generate a log entry or undo snapshot.
      expect(body.autoPass).toBe(true);
      await route.fulfill({ json: { game, autoPassed: false } });
    }
  });
  await page.goto("/");
  await expect.poll(() => requests.length).toBe(3);
  await expect(
    page.getByLabel("Your action, targets and mana payment"),
  ).toBeEnabled();
  await expect(page.locator(".table-status")).toContainText(
    "You have priority",
  );
  await expect(page.getByRole("log")).toContainText(
    "Automatically passed priority",
  );
  await page.waitForTimeout(900);
  expect(requests).toHaveLength(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Auto-pass when no legal actions"),
  ).toBeChecked();
  await expect(page.getByLabel("AI autoplay", { exact: true })).toBeChecked();
  await expect(page.locator(".table-status")).toContainText("AI has priority");
  await expect(
    page.getByRole("button", { name: "Resume automatic play" }),
  ).toBeVisible();
  await page.waitForTimeout(900);
  expect(requests).toHaveLength(3);
});

test("an assessment error leaves the game unchanged and pauses automatic play", async ({
  page,
}) => {
  const initial = await prepareTable(page);
  let requests = 0;
  await page.route("**/api/play", (route) => {
    requests++;
    return route.fulfill({
      status: 400,
      json: { error: "The priority check failed." },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "The priority check failed.",
  );
  await expect(
    page.getByLabel("Auto-pass when no legal actions"),
  ).toBeChecked();
  await expect(page.getByLabel("AI autoplay", { exact: true })).toBeChecked();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("chatedh-game-v1")!),
    ),
  ).toEqual(initial);
  await page.waitForTimeout(900);
  expect(requests).toBe(1);
  await expect(
    page.getByRole("button", { name: "Resume automatic play" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume automatic play" }).click();
  await expect.poll(() => requests).toBe(2);
});

test("stops automatic sequences after eight actions until the player continues", async ({
  page,
}) => {
  await prepareTable(page);
  let requests = 0;
  await page.route("**/api/play", async (route) => {
    const body = route.request().postDataJSON();
    requests++;
    const game: Game = body.game;
    game.priority = body.actor === "you" ? "ai" : "you";
    game.log.push({
      id: `step-${requests}`,
      turn: game.turn,
      actor: body.actor,
      text: "Pass priority.",
    });
    await route.fulfill({ json: { game, autoPassed: body.autoPass } });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Continue automatic play" }),
  ).toBeVisible({ timeout: 15000 });
  expect(requests).toBe(8);
  await page.waitForTimeout(900);
  expect(requests).toBe(8);
  await page.getByRole("button", { name: "Continue automatic play" }).click();
  await expect.poll(() => requests).toBeGreaterThan(8);
});
