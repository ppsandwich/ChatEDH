import { describe, it, expect } from "vitest";
import {
  applyRuling,
  catalogue,
  decks,
  newGame,
  keepHand,
  type Game,
  type Card,
  type Ruling,
} from "../src/lib/game";
import {
  planMana,
  availableManaSources,
  withManaPayment,
  type ManaPlan,
} from "../src/lib/mana";
function table() {
  const g = keepHand(newGame(decks[0], decks[1], "you"), []);
  g.cards = g.cards.filter((c) => c.commander);
  g.turn = 3;
  g.phase = "Main 1";
  return g;
}
function card(
  g: Game,
  name: string,
  zone: Card["zone"] = "battlefield",
  patch: Partial<Card> = {},
): Card {
  expect(catalogue[name], name).toBeDefined();
  const c: Card = {
    id: `test-${g.cards.length}`,
    name,
    owner: "you",
    controller: "you",
    zone,
    tapped: false,
    token: false,
    commander: false,
    counters: {},
    notes: "",
    damage: 0,
    revealed: false,
    controlledSinceTurn: 1,
    ...patch,
  };
  g.cards.push(c);
  return c;
}
function ready(plan: ManaPlan) {
  expect(plan.status).toBe("ready");
  if (plan.status !== "ready") throw Error(plan.reason);
  return plan;
}
function spell(g: Game, cost: string) {
  return card(g, "Arcane Signet", "hand", {
    definition: { ...catalogue["Arcane Signet"], manaCost: cost },
  });
}
describe("mana optimisation", () => {
  it("uses floating mana before tapping a source", () => {
    const g = table();
    g.players.you.mana = { C: 2 };
    card(g, "Sol Ring");
    const p = ready(planMana(g, spell(g, "{2}")));
    expect(p.sources).toHaveLength(0);
    expect(p.remaining.C).toBe(0);
  });
  it("matches coloured costs and preserves an unused flexible source", () => {
    const g = table();
    const island = card(g, "Island"),
      forest = card(g, "Forest"),
      tower = card(g, "Command Tower");
    const p = ready(planMana(g, spell(g, "{G}{U}")));
    expect(p.sources.map((s) => s.cardId).sort()).toEqual(
      [island.id, forest.id].sort(),
    );
    expect(p.sources.some((s) => s.cardId === tower.id)).toBe(false);
  });
  it("uses a single rock instead of two lands for generic mana", () => {
    const g = table();
    card(g, "Island");
    card(g, "Forest");
    const ring = card(g, "Sol Ring");
    const p = ready(planMana(g, spell(g, "{2}")));
    expect(p.sources.map((s) => s.cardId)).toEqual([ring.id]);
    expect(p.remaining.C).toBe(0);
  });
  it("picks colours jointly rather than spending the only green source on generic cost", () => {
    const g = table();
    card(g, "Island");
    const tower = card(g, "Command Tower");
    const p = ready(planMana(g, spell(g, "{1}{G}")));
    expect(p.sources.find((s) => s.cardId === tower.id)?.produces.G).toBe(1);
  });
  it("does not use tapped, enemy-controlled or off-battlefield sources", () => {
    const g = table();
    card(g, "Sol Ring", "battlefield", { tapped: true });
    card(g, "Sol Ring", "battlefield", { controller: "ai" });
    card(g, "Sol Ring", "graveyard");
    expect(planMana(g, spell(g, "{2}")).status).toBe("referee");
  });
  it("avoids paying life if an ordinary source can pay", () => {
    const g = table();
    card(g, "Mana Confluence");
    const island = card(g, "Island");
    const p = ready(planMana(g, spell(g, "{U}")));
    expect(p.life).toBe(0);
    expect(p.sources[0].cardId).toBe(island.id);
  });
  it("can pay life for Mana Confluence, but never recommends a lethal payment", () => {
    const g = table();
    card(g, "Mana Confluence");
    expect(ready(planMana(g, spell(g, "{U}"))).life).toBe(1);
    g.players.you.life = 1;
    expect(planMana(g, spell(g, "{U}")).status).toBe("referee");
  });
  it("preserves a Treasure when a land can pay", () => {
    const g = table();
    card(g, "Sol Ring", "battlefield", {
      name: "Treasure",
      token: true,
      definition: {
        ...catalogue["Sol Ring"],
        name: "Treasure",
        type: "Token Artifact — Treasure",
        text: "{T}, Sacrifice this artifact: Add one mana of any color.",
      },
    });
    const island = card(g, "Island");
    const p = ready(planMana(g, spell(g, "{U}")));
    expect(p.sources[0].cardId).toBe(island.id);
  });
  it("uses a legendary permanent’s colours for Mox Amber, not its Commander identity", () => {
    const g = table();
    card(g, "Najeela, the Blade-Blossom");
    card(g, "Mox Amber");
    expect(ready(planMana(g, spell(g, "{R}"))).sources[0].produces.R).toBe(1);
    expect(planMana(g, spell(g, "{U}")).status).toBe("referee");
  });
  it("defers colour indicators to the referee instead of guessing Amber’s colours", () => {
    const g = table();
    card(g, "Rograkh, Son of Rohgahh");
    card(g, "Mox Amber");
    expect(planMana(g, spell(g, "{R}")).status).toBe("referee");
  });
  it("uses Kinnan’s extra mana from a nonland permanent", () => {
    const g = table();
    g.cards.find((c) => c.name === "Kinnan, Bonder Prodigy")!.zone =
      "battlefield";
    card(g, "Sol Ring");
    const p = ready(planMana(g, spell(g, "{3}")));
    expect(p.sources).toHaveLength(1);
    expect(p.sources[0].produces.C).toBe(3);
  });
  it("includes separate commander tax and chosen X values", () => {
    const g = table();
    const commander = g.cards.find((c) => c.name === "Kinnan, Bonder Prodigy")!;
    g.players.you.commanderCasts[commander.id] = 1;
    card(g, "Island");
    card(g, "Forest");
    card(g, "Sol Ring");
    expect(ready(planMana(g, commander)).sources).toHaveLength(3);
    const x = ready(planMana(g, spell(g, "{X}{X}"), "you", 2));
    expect(x.sources).toHaveLength(3);
  });
  it("supports zero costs and coloured hybrid costs", () => {
    const g = table();
    expect(ready(planMana(g, spell(g, "{0}"))).sources).toHaveLength(0);
    card(g, "Forest");
    expect(ready(planMana(g, spell(g, "{G/U}"))).sources[0].produces.G).toBe(1);
  });
  it("falls back for a cost-changing permanent and Phyrexian choices", () => {
    const g = table();
    card(g, "Sol Ring");
    card(g, "Thalia, Guardian of Thraben");
    expect(planMana(g, spell(g, "{1}")).status).toBe("referee");
    expect(planMana(table(), spell(g, "{U/P}")).status).toBe("referee");
  });
  it("does not tap a summoning-sick creature during the following opponent turn", () => {
    const g = table();
    const bird = card(g, "Birds of Paradise", "battlefield", {
      controlledSinceTurn: 3,
    });
    g.active = "ai";
    g.turn = 4;
    expect(
      availableManaSources(g, "you")
        .flat()
        .some((s) => s.cardId === bird.id),
    ).toBe(false);
    g.active = "you";
    g.turn = 5;
    expect(
      availableManaSources(g, "you")
        .flat()
        .some((s) => s.cardId === bird.id),
    ).toBe(true);
  });
  it("does not assume an imported creature is ready when its control history is unknown", () => {
    const g = table();
    card(g, "Birds of Paradise", "battlefield", {
      controlledSinceTurn: undefined,
    });
    expect(availableManaSources(g, "you")).toHaveLength(0);
  });
  it("tracks control acquisition on entry and theft", () => {
    let g = table();
    const bird = card(g, "Birds of Paradise", "hand");
    g = applyRuling(
      g,
      {
        summary: "Enter",
        prompt: "",
        operations: [{ op: "move", cardId: bird.id, zone: "battlefield" }],
      },
      "system",
    );
    expect(g.cards.find((c) => c.id === bird.id)?.controlledSinceTurn).toBe(3);
    g.turn = 5;
    g = applyRuling(
      g,
      {
        summary: "Steal",
        prompt: "",
        operations: [{ op: "card", cardId: bird.id, controller: "ai" }],
      },
      "system",
    );
    expect(g.cards.find((c) => c.id === bird.id)?.controlledSinceTurn).toBe(5);
  });
});
describe("atomic mana payment", () => {
  function casting(c: Card): Ruling {
    return {
      summary: `Cast ${c.name}.`,
      prompt: "AI priority.",
      useManaPlan: true,
      operations: [
        { op: "move", cardId: c.id, zone: "stack" },
        {
          op: "stackAdd",
          item: {
            id: "spell",
            cardId: c.id,
            controller: "you",
            label: c.name,
            details: "Spell",
          },
        },
        { op: "priority", player: "ai" },
      ],
    };
  }
  it("taps sources, pays exactly and casts onto the stack in one transaction", () => {
    const g = table();
    const ring = card(g, "Sol Ring"),
      c = spell(g, "{2}");
    const before = structuredClone(g);
    const next = applyRuling(
      g,
      withManaPayment(g, casting(c), planMana(g, c), c.id, "you"),
      "you",
    );
    expect(next.cards.find((x) => x.id === ring.id)?.tapped).toBe(true);
    expect(next.players.you.mana.C).toBe(0);
    expect(next.stack[0].cardId).toBe(c.id);
    expect(g).toEqual(before);
    expect(next.log.at(-1)?.text).toContain("Auto-tap");
  });
  it("does not pay when a cast is rejected", () => {
    const g = table();
    const ring = card(g, "Sol Ring"),
      c = spell(g, "{2}");
    const ruling = {
      summary: "Illegal timing",
      prompt: "Wait for your main phase.",
      operations: [],
      useManaPlan: false,
    };
    const next = applyRuling(
      g,
      withManaPayment(g, ruling, planMana(g, c), c.id, "you"),
      "you",
    );
    expect(next.cards.find((x) => x.id === ring.id)?.tapped).toBe(false);
  });
  it("rejects payment twice and forged payment without a cast", () => {
    const g = table();
    const ring = card(g, "Sol Ring"),
      c = spell(g, "{2}"),
      p = planMana(g, c);
    const r = casting(c);
    r.operations.push({ op: "card", cardId: ring.id, tapped: true });
    expect(() => withManaPayment(g, r, p, c.id, "you")).toThrow(
      "changed an automatic payment",
    );
    expect(() =>
      withManaPayment(g, { ...casting(c), operations: [] }, p, c.id, "you"),
    ).toThrow("requires a spell");
  });
});
