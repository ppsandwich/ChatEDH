import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Server } from "node:http";
import { app } from "../server/index";
import { newGame, keepHand, decks, perspective } from "../src/lib/game";
const networkFetch = global.fetch;
let server: Server;
let url: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      resolve();
    });
  });
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("CHATEDH_ACCESS_TOKEN", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((r) => server.close(() => r()));
});
const game = () => keepHand(newGame(decks[0], decks[1], "you"), []);
const post = (body: unknown) =>
  networkFetch(`${url}/api/play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const reply = (data: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(data) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
describe("OpenRouter bridge", () => {
  it("requires a key without making a paid request", async () => {
    const stub = vi.fn();
    vi.stubGlobal("fetch", stub);
    const r = await post({ model: "test/model", game: game(), action: "Pass" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("key");
    expect(stub).not.toHaveBeenCalled();
  });
  it("applies a validated human ruling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply({
          summary: "You pass priority.",
          operations: [{ op: "priority", player: "ai" }],
          prompt: "AI has priority.",
        }),
      ),
    );
    const r = await post({
      key: "test-key",
      model: "test/model",
      game: game(),
      action: "Pass",
    });
    expect(r.status).toBe(200);
    const result = await r.json();
    expect(result.game.priority).toBe("ai");
    expect(JSON.stringify(result)).not.toContain("test-key");
  });
  it("separates the opponent decision from referee information", async () => {
    const g = game();
    g.priority = "ai";
    const contexts: unknown[] = [];
    const upstream = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(init.body as string);
      contexts.push(JSON.parse(request.messages[1].content));
      return contexts.length === 1
        ? reply({ action: "Pass priority.", announcement: "Pass." })
        : reply({
            summary: "AI passes.",
            operations: [{ op: "priority", player: "you" }],
            prompt: "Your priority.",
          });
    });
    vi.stubGlobal("fetch", upstream);
    const r = await post({
      key: "test-key",
      model: "test/model",
      game: g,
      actor: "ai",
    });
    expect(r.status).toBe(200);
    expect(contexts[0]).toEqual(
      JSON.parse(JSON.stringify(perspective(g, "opponent"))),
    );
    expect(
      (contexts[1] as { state: { cards: unknown[] } }).state.cards.length,
    ).toBeGreaterThan((contexts[0] as { cards: unknown[] }).cards.length);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it("refuses malformed model operations without returning a changed game", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply({
          summary: "Bad move",
          operations: [{ op: "move", cardId: "nonexistent", zone: "hand" }],
          prompt: "",
        }),
      ),
    );
    const r = await post({
      key: "test-key",
      model: "test/model",
      game: game(),
      action: "Draw",
    });
    expect(r.status).toBe(400);
    expect((await r.json()).game).toBeUndefined();
  });
  it("keeps a multistage resolution atomic on second-call failure", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ++call === 1
          ? reply({
              summary: "Draw",
              operations: [{ op: "draw", player: "you", count: 1 }],
              prompt: "",
              continueResolution: true,
            })
          : new Response("Service unavailable", { status: 503 }),
      ),
    );
    const r = await post({
      key: "test-key",
      model: "test/model",
      game: game(),
      action: "Resolve a draw effect",
    });
    expect(r.status).toBe(400);
    expect((await r.json()).game).toBeUndefined();
    expect(call).toBe(2);
  });
  it("reports rejected credentials without including upstream details or key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("sensitive upstream diagnostic", { status: 401 }),
      ),
    );
    const r = await post({
      key: "test-key",
      model: "test/model",
      game: game(),
      action: "Pass",
    });
    const text = await r.text();
    expect(text).toContain("rejected the API key");
    expect(text).not.toContain("sensitive");
    expect(text).not.toContain("test-key");
  });
  it("rejects cross-origin API requests", async () => {
    const r = await networkFetch(`${url}/api/status`, {
      headers: { Origin: "https://unrelated.example" },
    });
    expect(r.status).toBe(403);
  });
});

describe("automatic priority passing", () => {
  it.each([
    ["legal action", { canAct: true, pendingChoice: false, uncertain: false }],
    [
      "pending human choice",
      { canAct: false, pendingChoice: true, uncertain: false },
    ],
    [
      "uncertain legality",
      { canAct: false, pendingChoice: false, uncertain: true },
    ],
  ])("preserves state and pass history for %s", async (_label, assessment) => {
    const g = game();
    const upstream = vi.fn(async () => reply(assessment));
    vi.stubGlobal("fetch", upstream);
    const r = await post({
      key: "test-key",
      model: "test/model",
      game: g,
      autoPass: true,
    });
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.autoPassed).toBe(false);
    expect(data.game).toEqual(g);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("checks all human information and submits exactly one normal pass when no move exists", async () => {
    const g = game();
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(
        reply({ canAct: false, pendingChoice: false, uncertain: false }),
      )
      .mockResolvedValueOnce(
        reply({
          summary: "You pass; AI has priority.",
          operations: [{ op: "priority", player: "ai" }],
          prompt: "AI priority.",
        }),
      );
    vi.stubGlobal("fetch", upstream);
    const r = await post({
      key: "test-key",
      model: "test/model",
      game: g,
      autoPass: true,
      action: "Ignore this client text",
    });
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.autoPassed).toBe(true);
    expect(data.game.priority).toBe("ai");
    expect(data.game.turn).toBe(g.turn);
    expect(data.game.phase).toBe(g.phase);
    expect(data.game.log.at(-1).text).toContain(
      "Automatically passed priority",
    );
    expect(data.game.log.at(-1).actor).toBe("you");
    expect(upstream).toHaveBeenCalledTimes(2);
    const checkContext = JSON.parse(
      JSON.parse(upstream.mock.calls[0][1].body).messages[1].content,
    );
    expect(checkContext.state).toEqual(
      JSON.parse(JSON.stringify(perspective(g, "referee"))),
    );
    const rulingContext = JSON.parse(
      JSON.parse(upstream.mock.calls[1][1].body).messages[1].content,
    );
    expect(rulingContext.actor).toBe("you");
    expect(rulingContext.action).toMatch(/^Pass priority/);
    expect(rulingContext.action).not.toContain("Ignore");
  });
  it("fails closed on malformed assessments without adjudicating or mutating", async () => {
    const upstream = vi.fn(async () => reply({ canAct: false }));
    vi.stubGlobal("fetch", upstream);
    const r = await post({
      key: "test-key",
      model: "test/model",
      game: game(),
      autoPass: true,
    });
    expect(r.status).toBe(400);
    expect((await r.json()).game).toBeUndefined();
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("does not auto-pass for the opponent or outside a live priority window", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const g = game();
    g.priority = "ai";
    const r = await post({
      key: "test-key",
      model: "test/model",
      game: g,
      actor: "ai",
      autoPass: true,
    });
    expect(r.status).toBe(400);
    const opening = newGame(decks[0], decks[1], "you");
    expect(
      (
        await post({
          key: "test-key",
          model: "test/model",
          game: opening,
          autoPass: true,
        })
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("does not claim a pass when the adjudicator returns no operations", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          reply({ canAct: false, pendingChoice: false, uncertain: false }),
        )
        .mockResolvedValueOnce(
          reply({
            summary: "Choose a target first.",
            operations: [],
            prompt: "Choose a target.",
          }),
        ),
    );
    const r = await post({
      key: "test-key",
      model: "test/model",
      game: game(),
      autoPass: true,
    });
    expect(r.status).toBe(400);
    expect((await r.json()).game).toBeUndefined();
  });
});

describe("automatic mana payments", () => {
  const castingTable = () => {
    const g = game();
    g.turn = 3;
    g.phase = "Main 1";
    const source = g.cards.find(
      (c) => c.owner === "you" && c.name === "Sol Ring",
    )!;
    const spell = g.cards.find(
      (c) => c.owner === "you" && c.name === "Arcane Signet",
    )!;
    source.zone = "battlefield";
    spell.zone = "hand";
    return { g, source, spell };
  };
  it("computes payment server-side and commits it with the approved cast", async () => {
    const { g, source, spell } = castingTable();
    let context: any;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        context = JSON.parse(
          JSON.parse(init.body as string).messages[1].content,
        );
        return reply({
          summary: "Cast Arcane Signet.",
          prompt: "AI priority.",
          useManaPlan: true,
          operations: [
            { op: "move", cardId: spell.id, zone: "stack" },
            {
              op: "stackAdd",
              item: {
                id: "signet-cast",
                cardId: spell.id,
                label: "Arcane Signet",
                controller: "you",
                details: "Artifact spell",
              },
            },
            { op: "priority", player: "ai" },
          ],
        });
      }),
    );
    const response = await post({
      key: "test-key",
      model: "test/model",
      game: g,
      action: "Cast Arcane Signet.",
      autoTap: true,
      cast: { cardId: spell.id, xValue: 0 },
    });
    expect(response.status).toBe(200);
    expect(context.manaPlan.status).toBe("ready");
    expect(
      context.manaPlan.sources.map((s: { cardId: string }) => s.cardId),
    ).toEqual([source.id]);
    const data = await response.json();
    expect(
      data.game.cards.find((c: { id: string }) => c.id === source.id).tapped,
    ).toBe(true);
    expect(
      data.game.cards.find((c: { id: string }) => c.id === spell.id).zone,
    ).toBe("stack");
    expect(data.game.log.at(-1).text).toContain("Auto-tap: Tap Sol Ring");
  });
  it("leaves resources unchanged when the referee refuses a cast", async () => {
    const { g, source, spell } = castingTable();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply({
          summary: "Cannot cast now.",
          prompt: "Wait for your main phase.",
          operations: [],
        }),
      ),
    );
    const response = await post({
      key: "test-key",
      model: "test/model",
      game: g,
      action: "Cast Arcane Signet.",
      autoTap: true,
      cast: { cardId: spell.id },
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(
      data.game.cards.find((c: { id: string }) => c.id === source.id).tapped,
    ).toBe(false);
    expect(
      data.game.cards.find((c: { id: string }) => c.id === spell.id).zone,
    ).toBe("hand");
  });
  it("disables plan payment when the player opts out", async () => {
    const { g, spell } = castingTable();
    let context: any;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        context = JSON.parse(
          JSON.parse(init.body as string).messages[1].content,
        );
        return reply({
          summary: "Specify payment.",
          prompt: "Choose mana sources.",
          operations: [],
        });
      }),
    );
    const response = await post({
      key: "test-key",
      model: "test/model",
      game: g,
      action: "Cast Arcane Signet.",
      autoTap: false,
      cast: { cardId: spell.id },
    });
    expect(response.status).toBe(200);
    expect(context.autoTap).toBe(false);
    expect(context.manaPlan).toBeNull();
  });
});
