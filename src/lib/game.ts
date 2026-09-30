import { z } from "zod";
import cardData from "../data/cards.json";
import deckData from "../data/decks.json";
export type CardDefinition = {
  name: string;
  manaCost: string;
  manaValue: number;
  type: string;
  text: string;
  colours: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  legal: boolean;
  scryfallUrl: string;
};
export const catalogue = cardData as Record<string, CardDefinition>;
export const decks = deckData;
export type Deck = (typeof decks)[number];
export const zones = [
  "library",
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "command",
  "stack",
] as const;
export const phases = [
  "Untap",
  "Upkeep",
  "Draw",
  "Main 1",
  "Begin combat",
  "Attackers",
  "Blockers",
  "Combat damage",
  "End combat",
  "Main 2",
  "End step",
  "Cleanup",
] as const;
export const playerId = z.enum(["you", "ai"]);
export type PlayerId = z.infer<typeof playerId>;
export const cardSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  owner: playerId,
  controller: playerId,
  zone: z.enum(zones),
  tapped: z.boolean(),
  commander: z.boolean(),
  token: z.boolean(),
  counters: z.record(z.string(), z.number().int().min(-1000000).max(1000000)),
  damage: z.number().int().min(0).max(1000000),
  notes: z.string().max(2000),
  revealed: z.boolean(),
  definition: z
    .object({
      name: z.string().max(200),
      manaCost: z.string().max(200),
      manaValue: z.number().min(0).max(1000),
      type: z.string().max(200),
      text: z.string().max(10000),
      colours: z.array(z.string()).max(5),
      power: z.string().max(20).optional(),
      toughness: z.string().max(20).optional(),
      loyalty: z.string().max(20).optional(),
      legal: z.boolean(),
      scryfallUrl: z.string().max(500),
    })
    .optional(),
});
export type Card = z.infer<typeof cardSchema>;
const playerSchema = z.object({
  name: z.string(),
  deckId: z.string(),
  life: z.number().int().min(-1000000).max(1000000),
  poison: z.number().int().min(0).max(1000000),
  mana: z.record(z.string(), z.number().int().min(0).max(1000000)),
  commanderDamage: z.record(z.string(), z.number().int().min(0).max(1000000)),
  commanderCasts: z.record(z.string(), z.number().int().min(0).max(1000000)),
  cantLose: z.boolean().default(false),
  landPlays: z.number().int().min(0).max(100),
  mulligans: z.number().int().min(0).max(7),
});
export const stackSchema = z.object({
  id: z.string().max(100),
  cardId: z.string().nullable(),
  controller: playerId,
  label: z.string().max(300),
  details: z.string().max(3000),
});
export const gameSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  players: z.object({ you: playerSchema, ai: playerSchema }),
  cards: z.array(cardSchema).max(2000),
  stack: z.array(stackSchema).max(100),
  turn: z.number().int().min(1).max(10000),
  active: playerId,
  priority: playerId,
  phase: z.enum(phases),
  status: z.enum(["mulligan", "playing", "finished"]),
  winner: playerId.nullable(),
  reason: z.string().max(2000),
  prompt: z.string().max(3000),
  log: z
    .array(
      z.object({
        id: z.string(),
        turn: z.number(),
        actor: z.enum(["you", "ai", "system"]),
        text: z.string(),
      }),
    )
    .max(3000),
});
export type Game = z.infer<typeof gameSchema>;
export const opSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("move"),
    cardId: z.string(),
    zone: z.enum(zones),
    position: z.enum(["top", "bottom"]).optional(),
    controller: playerId.optional(),
  }),
  z.object({
    op: z.literal("draw"),
    player: playerId,
    count: z.number().int().min(1).max(200),
  }),
  z.object({ op: z.literal("shuffle"), player: playerId }),
  z.object({
    op: z.literal("peek"),
    player: playerId,
    count: z.number().int().min(1).max(200),
  }),
  z.object({
    op: z.literal("card"),
    cardId: z.string(),
    tapped: z.boolean().optional(),
    damage: z.number().int().min(0).max(1000000).optional(),
    counters: z
      .record(z.string(), z.number().int().min(-1000000).max(1000000))
      .optional(),
    notes: z.string().max(2000).optional(),
    revealed: z.boolean().optional(),
    controller: playerId.optional(),
  }),
  z.object({
    op: z.literal("player"),
    player: playerId,
    cantLose: z.boolean().optional(),
    life: z.number().int().min(-1000000).max(1000000).optional(),
    poison: z.number().int().min(0).max(1000000).optional(),
    mana: z.record(z.string(), z.number().int().min(0).max(1000000)).optional(),
    commanderDamage: z
      .record(z.string(), z.number().int().min(0).max(1000000))
      .optional(),
    commanderCasts: z
      .record(z.string(), z.number().int().min(0).max(1000000))
      .optional(),
    landPlays: z.number().int().min(0).max(100).optional(),
  }),
  z.object({ op: z.literal("stackAdd"), item: stackSchema }),
  z.object({ op: z.literal("stackRemove"), id: z.string() }),
  z.object({
    op: z.literal("turn"),
    active: playerId,
    priority: playerId,
    phase: z.enum(phases),
    turn: z.number().int().min(1).max(10000),
  }),
  z.object({ op: z.literal("priority"), player: playerId }),
  z.object({
    op: z.literal("token"),
    player: playerId,
    name: z.string().max(200),
    type: z.string().max(200),
    text: z.string().max(4000),
    power: z.string().max(20).optional(),
    toughness: z.string().max(20).optional(),
    count: z.number().int().min(1).max(100),
  }),
  z.object({
    op: z.literal("finish"),
    winner: playerId.nullable(),
    reason: z.string().max(2000),
  }),
]);
export const rulingSchema = z.object({
  summary: z.string().min(1).max(4000),
  operations: z.array(opSchema).max(300),
  prompt: z.string().max(3000),
  continueResolution: z.boolean().optional(),
});
export type Ruling = z.infer<typeof rulingSchema>;
export function uid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Plain-HTTP LAN origins lack randomUUID, but support getRandomValues.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const n = new Uint32Array(1);
    const max = 4294967296 - (4294967296 % (i + 1));
    do {
      crypto.getRandomValues(n);
    } while (n[0] >= max);
    const j = n[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function log(
  game: Game,
  actor: Game["log"][number]["actor"],
  text: string,
) {
  game.log.push({ id: uid(), turn: game.turn, actor, text });
  game.log = game.log.slice(-1000);
}
export function cardsIn(g: Game, p: PlayerId, zone: Card["zone"]) {
  return g.cards.filter(
    (c) =>
      c.zone === zone &&
      (zone === "battlefield" ? c.controller : c.owner) === p,
  );
}
export function definition(c: Card): CardDefinition {
  return c.definition ?? catalogue[c.name];
}
export function newGame(yourDeck: Deck, aiDeck: Deck, first: PlayerId): Game {
  const player = (deck: Deck, name: string) => ({
    name,
    deckId: deck.id,
    life: 40,
    poison: 0,
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    commanderDamage: {},
    commanderCasts: {},
    cantLose: false,
    landPlays: 0,
    mulligans: 0,
  });
  const game: Game = {
    version: 1,
    id: uid(),
    players: { you: player(yourDeck, "You"), ai: player(aiDeck, "OpenRouter") },
    cards: [],
    stack: [],
    turn: 1,
    active: first,
    priority: first,
    phase: "Untap",
    status: "mulligan",
    winner: null,
    reason: "",
    prompt: "Keep your opening seven, or take a London mulligan.",
    log: [],
  };
  for (const [p, deck] of [
    ["you", yourDeck],
    ["ai", aiDeck],
  ] as const) {
    const cs = deck.cards.map((name, i) => ({
      id: `${p}-${i}`,
      name,
      owner: p,
      controller: p,
      zone: (deck.commanders.includes(name)
        ? "command"
        : "library") as Card["zone"],
      tapped: false,
      commander: deck.commanders.includes(name),
      token: false,
      counters: {},
      damage: 0,
      notes: "",
      revealed: false,
    }));
    game.cards.push(...shuffled(cs));
    draw(game, p, 7);
  }
  log(
    game,
    "system",
    `${yourDeck.name} vs ${aiDeck.name}. 40 life. ${first === "you" ? "You play" : "AI plays"} first. London mulligans; no free mulligan in two-player games.`,
  );
  return game;
}
function draw(g: Game, p: PlayerId, count: number) {
  for (let i = 0; i < count; i++) {
    const c = cardsIn(g, p, "library")[0];
    if (!c) {
      if (g.players[p].cantLose) return;
      g.status = "finished";
      g.winner = p === "you" ? "ai" : "you";
      g.reason = `${g.players[p].name} tried to draw from an empty library.`;
      return;
    }
    c.zone = "hand";
    c.revealed = false;
  }
}
export function mulligan(game: Game) {
  if (game.status !== "mulligan")
    throw new Error("The opening hand has already been kept.");
  const g = structuredClone(game);
  if (g.players.you.mulligans >= 7)
    throw new Error("You have taken seven mulligans.");
  for (const c of cardsIn(g, "you", "hand")) c.zone = "library";
  const other = g.cards.filter(
    (c) => c.owner !== "you" || c.zone !== "library",
  );
  g.cards = [...other, ...shuffled(cardsIn(g, "you", "library"))];
  g.players.you.mulligans++;
  draw(g, "you", 7);
  log(g, "you", `London mulligan ${g.players.you.mulligans}.`);
  return g;
}
export function keepHand(game: Game, bottom: string[]) {
  const g = structuredClone(game);
  if (g.status !== "mulligan")
    throw new Error("The opening hand has already been kept.");
  if (new Set(bottom).size !== g.players.you.mulligans)
    throw new Error(
      `Choose ${g.players.you.mulligans} cards to put on the bottom.`,
    );
  for (const id of bottom) {
    const c = g.cards.find(
      (c) => c.id === id && c.zone === "hand" && c.owner === "you",
    );
    if (!c) throw new Error("Choose cards from your opening hand.");
    g.cards = g.cards.filter((x) => x.id !== id);
    g.cards.push({ ...c, zone: "library" });
  }
  g.status = "playing";
  g.phase = "Upkeep";
  g.prompt = `${g.active === "you" ? "Your" : "AI"} upkeep. The starting player skips their first draw.`;
  log(g, "you", `Kept ${7 - bottom.length} cards.`);
  return g;
}
export function validateGame(input: unknown): Game {
  const g = gameSchema.parse(input);
  const ids = new Set(g.cards.map((c) => c.id));
  if (ids.size !== g.cards.length) throw new Error("Duplicate card IDs.");
  for (const c of g.cards) {
    if (!catalogue[c.name] && !c.token)
      throw new Error(`Unknown card: ${c.name}`);
    if (
      c.token &&
      (!c.definition ||
        typeof c.definition.text !== "string" ||
        typeof c.definition.type !== "string" ||
        typeof c.definition.name !== "string")
    )
      throw new Error("Invalid token definition.");
  }
  const stackIds = new Set(g.stack.map((x) => x.id));
  if (stackIds.size !== g.stack.length) throw new Error("Duplicate stack IDs.");
  for (const s of g.stack)
    if (
      s.cardId &&
      !g.cards.some((c) => c.id === s.cardId && c.zone === "stack")
    )
      throw new Error("A stack item points to a missing spell.");
  for (const c of g.cards.filter((c) => c.zone === "stack"))
    if (g.stack.filter((x) => x.cardId === c.id).length !== 1)
      throw new Error("A spell on the stack needs a stack item.");
  return g;
}
export function applyRuling(
  game: Game,
  input: unknown,
  actor: "you" | "ai" | "system",
): Game {
  const result = rulingSchema.parse(input);
  if (game.status !== "playing")
    throw new Error("This game is not in progress.");
  const g = structuredClone(game);
  for (const op of result.operations) {
    if (op.op === "move") {
      const c = g.cards.find((c) => c.id === op.cardId);
      if (!c) throw new Error(`Unknown card ${op.cardId}`);
      c.zone = op.zone;
      c.controller = op.controller ?? c.owner;
      c.damage = 0;
      c.counters = {};
      c.tapped = false;
      c.notes = "";
      c.revealed = false;
      if (c.token && op.zone !== "battlefield") {
        g.cards = g.cards.filter((x) => x.id !== c.id);
      } else if (op.zone === "library") {
        g.cards = g.cards.filter((x) => x.id !== c.id);
        if (op.position === "bottom") g.cards.push(c);
        else g.cards.unshift(c);
      }
    } else if (op.op === "draw") draw(g, op.player, op.count);
    else if (op.op === "peek") {
      for (const c of cardsIn(g, op.player, "library").slice(0, op.count))
        c.revealed = true;
    } else if (op.op === "shuffle") {
      for (const c of cardsIn(g, op.player, "library")) c.revealed = false;
      const other = g.cards.filter(
        (c) => c.owner !== op.player || c.zone !== "library",
      );
      g.cards = [...other, ...shuffled(cardsIn(g, op.player, "library"))];
    } else if (op.op === "card") {
      const c = g.cards.find((c) => c.id === op.cardId);
      if (!c) throw new Error(`Unknown card ${op.cardId}`);
      const { op: _, cardId: __, ...patch } = op;
      Object.assign(c, patch);
    } else if (op.op === "player") {
      const { op: _, player, ...patch } = op;
      Object.assign(g.players[player], patch);
    } else if (op.op === "stackAdd") {
      if (g.stack.some((s) => s.id === op.item.id))
        throw new Error("Duplicate stack item");
      g.stack.push(op.item);
    } else if (op.op === "stackRemove") {
      if (!g.stack.some((s) => s.id === op.id))
        throw new Error("Stack item does not exist");
      g.stack = g.stack.filter((s) => s.id !== op.id);
    } else if (op.op === "turn") {
      if (op.turn < g.turn || op.turn > g.turn + 1)
        throw new Error("Invalid turn advance");
      Object.assign(g, {
        active: op.active,
        priority: op.priority,
        phase: op.phase,
        turn: op.turn,
      });
    } else if (op.op === "priority") g.priority = op.player;
    else if (op.op === "token")
      for (let i = 0; i < op.count; i++)
        g.cards.push({
          id: uid(),
          name: op.name,
          owner: op.player,
          controller: op.player,
          zone: "battlefield",
          tapped: false,
          commander: false,
          token: true,
          counters: {},
          damage: 0,
          notes: "",
          revealed: true,
          definition: {
            name: op.name,
            type: op.type,
            text: op.text,
            manaCost: "",
            manaValue: 0,
            colours: [],
            power: op.power,
            toughness: op.toughness,
            legal: true,
            scryfallUrl: "",
          },
        });
    else if (op.op === "finish") {
      g.status = "finished";
      g.winner = op.winner;
      g.reason = op.reason;
    }
  }
  const losing = (["you", "ai"] as const).filter((p) => {
    const x = g.players[p];
    return (
      !x.cantLose &&
      (x.life <= 0 ||
        x.poison >= 10 ||
        Object.values(x.commanderDamage).some((n) => n >= 21))
    );
  });
  if (losing.length) {
    g.status = "finished";
    g.winner = losing.length === 2 ? null : losing[0] === "you" ? "ai" : "you";
    const x = g.players[losing[0]];
    g.reason =
      losing.length === 2
        ? "Both players lost simultaneously."
        : x.life <= 0
          ? "Life total reached zero."
          : x.poison >= 10
            ? "Ten poison counters."
            : "21 combat damage from a single commander.";
  }
  g.prompt = result.prompt;
  log(g, actor, result.summary);
  return validateGame(g);
}
// The opponent sees its own hand and public information, never either library's order or the human hand.
export function perspective(g: Game, role: "opponent" | "referee") {
  const visible = g.cards.filter((c) =>
    c.zone === "library"
      ? c.revealed && (role === "referee" || c.owner === "ai")
      : role === "referee" ||
        c.zone !== "hand" ||
        c.owner === "ai" ||
        c.revealed,
  );
  return {
    ...g,
    cards: visible.map((c) => ({ ...c, definition: definition(c) })),
    knownDeck:
      role === "opponent"
        ? decks.find((d) => d.id === g.players.ai.deckId)?.cards
        : undefined,
    libraries:
      role === "referee"
        ? (["you", "ai"] as const).map((p) => ({
            player: p,
            cards: cardsIn(g, p, "library")
              .map((c) => ({ id: c.id, name: c.name }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          }))
        : undefined,
    counts: {
      you: {
        hand: cardsIn(g, "you", "hand").length,
        library: cardsIn(g, "you", "library").length,
      },
      ai: {
        hand: cardsIn(g, "ai", "hand").length,
        library: cardsIn(g, "ai", "library").length,
      },
    },
    log: g.log.slice(-24),
  };
}
export function exportGame(g: Game) {
  return JSON.stringify(g, null, 2);
}
