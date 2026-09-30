import { describe, it, expect, vi } from "vitest";
import {
  decks,
  uid,
  catalogue,
  newGame,
  keepHand,
  mulligan,
  cardsIn,
  applyRuling,
  perspective,
  validateGame,
  exportGame,
  type Game,
} from "../src/lib/game";
const playing = () => keepHand(newGame(decks[0], decks[1], "you"), []);
describe("bundled Commander decks", () => {
  it("ships twelve distinct 100-card, legal, colour-correct singleton decks", () => {
    expect(decks).toHaveLength(12);
    expect(new Set(decks.map((d) => d.id)).size).toBe(12);
    for (const deck of decks) {
      expect(deck.cards).toHaveLength(100);
      const seen = new Set<string>();
      for (const name of deck.cards) {
        const c = catalogue[name];
        expect(c, `${deck.name}: ${name}`).toBeDefined();
        expect(c.legal, `${name} legality`).toBe(true);
        expect(
          c.colours.every((x) => deck.colours.includes(x)),
          `${deck.name}: ${name} colour`,
        ).toBe(true);
        if (!c.type.includes("Basic Land"))
          expect(seen.has(name), `${deck.name}: duplicate ${name}`).toBe(false);
        seen.add(name);
      }
      expect(deck.commanders.every((c) => deck.cards.includes(c))).toBe(true);
      expect(
        deck.cards.filter(
          (n) =>
            catalogue[n].type.includes("Land") &&
            !catalogue[n].type.includes("//"),
        ).length,
      ).toBe(deck.lands);
    }
  });
  it("has complete Oracle text and no bundled artwork fields", () => {
    for (const card of Object.values(catalogue)) {
      expect(card.name).toBeTruthy();
      expect(card.type).toBeTruthy();
      expect(typeof card.text).toBe("string");
      expect(JSON.stringify(card)).not.toMatch(/image_uris|\.jpg|\.png|\.webp/);
    }
  });
});
describe("game lifecycle", () => {
  it("deals seven and separates commanders while conserving all 200 cards", () => {
    for (const deck of decks) {
      const g = newGame(deck, decks[1], "you");
      expect(g.cards).toHaveLength(200);
      expect(cardsIn(g, "you", "hand")).toHaveLength(7);
      expect(cardsIn(g, "you", "command")).toHaveLength(deck.commanders.length);
      expect(cardsIn(g, "you", "library")).toHaveLength(
        93 - deck.commanders.length,
      );
      expect(g.players.you.life).toBe(40);
      expect(g.status).toBe("mulligan");
    }
  });
  it("applies London mulligans without a free mulligan and bottoms chosen cards", () => {
    let g = newGame(decks[0], decks[1], "you");
    g = mulligan(mulligan(g));
    expect(cardsIn(g, "you", "hand")).toHaveLength(7);
    expect(() => keepHand(g, [])).toThrow();
    const ids = cardsIn(g, "you", "hand")
      .slice(0, 2)
      .map((c) => c.id);
    g = keepHand(g, ids);
    expect(cardsIn(g, "you", "hand")).toHaveLength(5);
    expect(
      cardsIn(g, "you", "library")
        .slice(-2)
        .map((c) => c.id),
    ).toEqual(ids);
    expect(g.phase).toBe("Upkeep");
    expect(g.status).toBe("playing");
    expect(() => mulligan(g)).toThrow();
  });
  it("round-trips saved games", () => {
    const g = playing();
    expect(validateGame(JSON.parse(exportGame(g)))).toEqual(g);
  });
  it("rejects malformed saves and unknown non-token cards", () => {
    const g = playing();
    g.cards[0].name = "Invented card";
    expect(() => validateGame(g)).toThrow();
    const x = playing();
    x.cards.push(x.cards[0]);
    expect(() => validateGame(x)).toThrow("Duplicate");
  });
});
describe("atomic state operations", () => {
  it("does not mutate the original on a failed AI transaction", () => {
    const g = playing(),
      before = exportGame(g);
    expect(() =>
      applyRuling(
        g,
        {
          summary: "bad",
          prompt: "",
          operations: [
            { op: "player", player: "you", life: 12 },
            { op: "move", cardId: "missing", zone: "hand" },
          ],
        },
        "ai",
      ),
    ).toThrow();
    expect(exportGame(g)).toBe(before);
  });
  it("tracks spells on the stack and requires atomic resolution", () => {
    const g = playing();
    const c = cardsIn(g, "you", "hand")[0];
    const cast = applyRuling(
      g,
      {
        summary: "Cast",
        prompt: "AI priority",
        operations: [
          { op: "move", cardId: c.id, zone: "stack" },
          {
            op: "stackAdd",
            item: {
              id: "s1",
              cardId: c.id,
              controller: "you",
              label: c.name,
              details: "Spell",
            },
          },
          { op: "priority", player: "ai" },
        ],
      },
      "you",
    );
    expect(cast.stack).toHaveLength(1);
    expect(cast.priority).toBe("ai");
    expect(() =>
      applyRuling(
        cast,
        {
          summary: "bad",
          prompt: "",
          operations: [{ op: "stackRemove", id: "s1" }],
        },
        "ai",
      ),
    ).toThrow();
    const resolved = applyRuling(
      cast,
      {
        summary: "Resolved",
        prompt: "Your priority",
        operations: [
          { op: "stackRemove", id: "s1" },
          { op: "move", cardId: c.id, zone: "graveyard" },
        ],
      },
      "ai",
    );
    expect(resolved.stack).toHaveLength(0);
    expect(resolved.cards.find((x) => x.id === c.id)?.zone).toBe("graveyard");
  });
  it("draws from the actual top and recognises an empty-library loss", () => {
    const g = playing();
    const top = cardsIn(g, "you", "library")[0];
    const result = applyRuling(
      g,
      {
        summary: "Draw",
        prompt: "",
        operations: [{ op: "draw", player: "you", count: 1 }],
      },
      "you",
    );
    expect(result.cards.find((c) => c.id === top.id)?.zone).toBe("hand");
    const empty = playing();
    empty.cards = empty.cards.filter(
      (c) => c.zone !== "library" || c.owner !== "you",
    );
    const end = applyRuling(
      empty,
      {
        summary: "Draw",
        prompt: "",
        operations: [{ op: "draw", player: "you", count: 1 }],
      },
      "you",
    );
    expect(end.winner).toBe("ai");
    expect(end.status).toBe("finished");
  });
  it.each([{ life: 0 }, { poison: 10 }, { commanderDamage: { "ai-0": 21 } }])(
    "recognises loss from %j",
    (patch) => {
      const g = applyRuling(
        playing(),
        {
          summary: "Damage",
          prompt: "",
          operations: [{ op: "player", player: "you", ...patch }],
        },
        "ai",
      );
      expect(g.status).toBe("finished");
      expect(g.winner).toBe("ai");
    },
  );
  it("does not combine damage from partner commanders for lethal", () => {
    const g = applyRuling(
      playing(),
      {
        summary: "Damage",
        prompt: "",
        operations: [
          { op: "player", player: "you", commanderDamage: { a: 12, b: 12 } },
        ],
      },
      "ai",
    );
    expect(g.status).toBe("playing");
  });
  it("creates tokens and removes them when they leave the battlefield", () => {
    const g = applyRuling(
      playing(),
      {
        summary: "Treasure",
        prompt: "",
        operations: [
          {
            op: "token",
            player: "you",
            count: 2,
            name: "Treasure",
            type: "Token Artifact — Treasure",
            text: "{T}, Sacrifice this artifact: Add one mana of any colour.",
          },
        ],
      },
      "you",
    );
    const token = g.cards.find((c) => c.token)!;
    expect(g.cards.filter((c) => c.token)).toHaveLength(2);
    const next = applyRuling(
      g,
      {
        summary: "Sacrifice",
        prompt: "",
        operations: [{ op: "move", cardId: token.id, zone: "graveyard" }],
      },
      "you",
    );
    expect(next.cards.some((c) => c.id === token.id)).toBe(false);
  });
  it("preserves commander identity and individual tax across zone changes", () => {
    let g = playing();
    const c = cardsIn(g, "you", "command")[0];
    g = applyRuling(
      g,
      {
        summary: "Commander returned",
        prompt: "",
        operations: [
          { op: "player", player: "you", commanderCasts: { [c.id]: 2 } },
          { op: "move", cardId: c.id, zone: "battlefield" },
          { op: "move", cardId: c.id, zone: "command" },
        ],
      },
      "you",
    );
    expect(g.players.you.commanderCasts[c.id]).toBe(2);
    expect(g.cards.find((x) => x.id === c.id)?.commander).toBe(true);
  });
});
describe("information boundaries", () => {
  it("never sends the human hand or either library order to the opponent", () => {
    const g = playing();
    const view = perspective(g, "opponent");
    expect(
      view.cards.filter((c) => c.owner === "you" && c.zone === "hand"),
    ).toHaveLength(0);
    expect(view.cards.filter((c) => c.zone === "library")).toHaveLength(0);
    expect(view.libraries).toBeUndefined();
    expect(
      view.cards.filter((c) => c.owner === "ai" && c.zone === "hand"),
    ).toHaveLength(7);
    expect(view.counts.you.hand).toBe(7);
  });
  it("lets the referee see both hands but sorts libraries independently of draw order", () => {
    const g = playing();
    const view = perspective(g, "referee");
    expect(view.cards.filter((c) => c.zone === "hand")).toHaveLength(14);
    for (const lib of view.libraries!) {
      expect(lib.cards.map((c) => c.name)).toEqual(
        [...lib.cards.map((c) => c.name)].sort((a, b) => a.localeCompare(b)),
      );
    }
  });
  it("keeps a human scry private and supplies actual order to the referee", () => {
    const g = applyRuling(
      playing(),
      {
        summary: "Scry 2",
        prompt: "Choose order",
        operations: [{ op: "peek", player: "you", count: 2 }],
      },
      "you",
    );
    expect(
      perspective(g, "opponent").cards.filter((c) => c.zone === "library"),
    ).toHaveLength(0);
    expect(
      perspective(g, "referee")
        .cards.filter((c) => c.zone === "library")
        .map((c) => c.id),
    ).toEqual(
      cardsIn(g, "you", "library")
        .slice(0, 2)
        .map((c) => c.id),
    );
  });
});

describe("simultaneous state-based losses and prevention", () => {
  it("declares a draw when both players lose simultaneously", () => {
    const g = applyRuling(
      playing(),
      {
        summary: "Both take lethal damage.",
        prompt: "",
        operations: [
          { op: "player", player: "you", life: 0 },
          { op: "player", player: "ai", life: 0 },
        ],
      },
      "system",
    );
    expect(g.status).toBe("finished");
    expect(g.winner).toBeNull();
  });
  it("honours a cannot-lose effect until it is removed", () => {
    const protectedGame = applyRuling(
      playing(),
      {
        summary: "Loss prevention applies.",
        prompt: "",
        operations: [{ op: "player", player: "you", life: -5, cantLose: true }],
      },
      "system",
    );
    expect(protectedGame.status).toBe("playing");
    const end = applyRuling(
      protectedGame,
      {
        summary: "Loss prevention ends.",
        prompt: "",
        operations: [{ op: "player", player: "you", cantLose: false }],
      },
      "system",
    );
    expect(end.status).toBe("finished");
    expect(end.winner).toBe("ai");
  });
});

describe("IDs on plain-HTTP network origins", () => {
  it("creates random UUID v4 IDs without crypto.randomUUID", () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal("crypto", { getRandomValues });
    try {
      const ids = Array.from({ length: 100 }, () => uid());
      expect(new Set(ids).size).toBe(100);
      for (const id of ids)
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      expect(validateGame(playing()).status).toBe("playing");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
