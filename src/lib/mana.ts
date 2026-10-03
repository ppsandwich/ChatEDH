import {
  cardsIn,
  definition,
  type Card,
  type Game,
  type PlayerId,
  type Ruling,
} from "./game";

export const manaTypes = ["W", "U", "B", "R", "G", "C"] as const;
type ManaType = (typeof manaTypes)[number];
type Pool = Record<ManaType, number>;
export type ManaSource = {
  cardId: string;
  name: string;
  produces: Pool;
  life: number;
  sacrifice: boolean;
  flexibility: number;
  creature: boolean;
};
export type ManaPlan =
  | {
      status: "ready";
      cost: string;
      sources: ManaSource[];
      remaining: Pool;
      life: number;
      score: number[];
      usedFloating: boolean;
    }
  | { status: "referee"; reason: string; cost: string };
const pool = (values: Record<string, number> = {}): Pool =>
  Object.fromEntries(manaTypes.map((c) => [c, values[c] ?? 0])) as Pool;
const total = (p: Pool) => manaTypes.reduce((n, c) => n + p[c], 0);
const add = (a: Pool, b: Pool): Pool =>
  pool(Object.fromEntries(manaTypes.map((c) => [c, a[c] + b[c]])));
const symbols = (p: Pool) =>
  manaTypes.map((c) => `{${c}}`.repeat(p[c])).join("");
const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};
const colourChoices = (colours: readonly string[]) =>
  colours
    .filter((c) => manaTypes.includes(c as ManaType))
    .map((c) => pool({ [c]: 1 }));
function commanderColours(g: Game, p: PlayerId) {
  return [
    ...new Set(
      g.cards
        .filter((c) => c.owner === p && c.commander)
        .flatMap((c) => definition(c).colours),
    ),
  ];
}

// Only model ordinary, unrestricted mana abilities. The referee handles other costs/effects.
function outputs(
  g: Game,
  c: Card,
): { choices: Pool[]; life: number; sacrifice: boolean } | null {
  const d = definition(c),
    colours = commanderColours(g, c.controller);
  if (c.notes.trim()) return null;
  const any = colourChoices(manaTypes.slice(0, 5));
  if (c.name === "Command Tower" || c.name === "Arcane Signet")
    return { choices: colourChoices(colours), life: 0, sacrifice: false };
  if (c.name === "Mana Confluence")
    return { choices: any, life: 1, sacrifice: false };
  // Damage may create triggers or be prevented; let the referee handle Ancient Tomb and painlands' coloured modes.
  if (c.name === "Mox Opal")
    return cardsIn(g, c.controller, "battlefield").filter((x) =>
      definition(x).type.includes("Artifact"),
    ).length >= 3
      ? { choices: any, life: 0, sacrifice: false }
      : null;
  if (c.name === "Mox Amber") {
    const legendary = cardsIn(g, c.controller, "battlefield").filter(
      (x) =>
        definition(x).type.includes("Legendary") &&
        /Creature|Planeswalker/.test(definition(x).type),
    );
    // Catalogue colours are Commander identity. Amber uses the permanent's actual colours.
    const actualColours = legendary.map((card) => {
      const d = definition(card);
      if (card.notes.trim()) return null;
      if (/\bDevoid\b/i.test(d.text)) return [];
      const printed = [...new Set(d.manaCost.match(/[WUBRG]/g) ?? [])];
      // Colour indicators (e.g. Rograkh) and characteristic abilities need the referee.
      if (
        (!printed.length && d.colours.length) ||
        /is all colors|is all colours/i.test(d.text)
      )
        return null;
      return printed;
    });
    if (actualColours.some((colours) => colours === null)) return null;
    return {
      choices: colourChoices([
        ...new Set(actualColours.flatMap((colours) => colours ?? [])),
      ]),
      life: 0,
      sacrifice: false,
    };
  }

  if (c.name === "Gemstone Caverns")
    return {
      choices: (c.counters.luck ?? 0) > 0 ? any : [pool({ C: 1 })],
      life: 0,
      sacrifice: false,
    };
  if (
    c.token &&
    /\bTreasure\b/.test(d.type) &&
    /Sacrifice.*Add one mana of any colo[u]?r/i.test(d.text)
  )
    return { choices: any, life: 0, sacrifice: true };
  if (c.name === "Lotus Petal") return null; // Requires a sacrifice without tapping; leave optional resources to the referee.
  const choices: Pool[] = [];
  for (let line of d.text.split("\n")) {
    line = line.replace(/^\(/, "").replace(/\)$/, "").trim();
    const match = line.match(/^\{T\}: Add (.+)\.$/);
    if (!match) continue;
    if (/^one mana of any color$/.test(match[1])) choices.push(...any);
    else if (/^(?:\{[WUBRGC]\})+$/.test(match[1])) {
      const out = pool();
      for (const m of match[1].matchAll(/\{([WUBRGC])\}/g))
        out[m[1] as ManaType]++;
      choices.push(out);
    } else if (
      /^\{[WUBRGC]\}(?:(?:, |, or | or )\{[WUBRGC]\})+$/.test(match[1])
    )
      choices.push(
        ...colourChoices(
          [...match[1].matchAll(/\{([WUBRGC])\}/g)].map((m) => m[1]),
        ),
      );
  }
  return choices.length ? { choices, life: 0, sacrifice: false } : null;
}
function canTapCreature(g: Game, c: Card) {
  if (!definition(c).type.includes("Creature")) return true;
  if (/\bHaste\b/i.test(definition(c).text)) return true;
  if (c.controlledSinceTurn === undefined) return false;
  const latestOwnTurn = g.active === c.controller ? g.turn : g.turn - 1;
  return c.controlledSinceTurn < latestOwnTurn;
}
export function availableManaSources(g: Game, p: PlayerId): ManaSource[][] {
  const kinnan = cardsIn(g, p, "battlefield").some(
    (c) => c.name === "Kinnan, Bonder Prodigy",
  );
  return cardsIn(g, p, "battlefield")
    .filter((c) => !c.tapped && canTapCreature(g, c))
    .flatMap((c) => {
      const out = outputs(g, c);
      if (!out?.choices.length) return [];
      const choices = out.choices.flatMap((produces) => {
        if (kinnan && !definition(c).type.includes("Land"))
          return manaTypes
            .filter((colour) => produces[colour] > 0)
            .map((colour) => add(produces, pool({ [colour]: 1 })));
        return [produces];
      });
      return [
        choices.map((produces) => ({
          cardId: c.id,
          name: c.name,
          produces,
          life: out.life,
          sacrifice: out.sacrifice,
          flexibility: out.choices.length - 1,
          creature: definition(c).type.includes("Creature"),
        })),
      ];
    });
}
type Cost = { specific: Pool; generic: number };
function costs(cost: string, x: number, tax: number): Cost[] | null {
  let options: Cost[] = [{ specific: pool(), generic: tax }];
  const tokens = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (tokens.map((t) => `{${t}}`).join("") !== cost) return null;
  for (const token of tokens) {
    if (/^\d+$/.test(token) || token === "X") {
      for (const c of options) c.generic += token === "X" ? x : Number(token);
    } else if (manaTypes.includes(token as ManaType)) {
      for (const c of options) c.specific[token as ManaType]++;
    } else if (/^[WUBRG]\/[WUBRG]$/.test(token)) {
      options = options.flatMap((c) =>
        token.split("/").map((colour) => ({
          specific: add(c.specific, pool({ [colour]: 1 })),
          generic: c.generic,
        })),
      );
    } else return null;
    if (options.length > 32) return null;
  }
  return options;
}
function pay(p: Pool, cost: Cost): Pool | null {
  const left = pool(p);
  for (const c of manaTypes) {
    if (left[c] < cost.specific[c]) return null;
    left[c] -= cost.specific[c];
  }
  let generic = cost.generic;
  // Spend colourless first, then the most plentiful coloured mana.
  for (const c of [
    "C",
    ...manaTypes.filter((c) => c !== "C").sort((a, b) => left[b] - left[a]),
  ] as ManaType[]) {
    const use = Math.min(left[c], generic);
    left[c] -= use;
    generic -= use;
  }
  return generic === 0 ? left : null;
}
export function planMana(
  g: Game,
  spell: Card,
  p: PlayerId = "you",
  xValue = 0,
): ManaPlan {
  const d = definition(spell),
    tax =
      spell.commander && spell.zone === "command"
        ? 2 * (g.players[p].commanderCasts[spell.id] ?? 0)
        : 0;
  const cost = d.manaCost + (tax ? `{${tax}}` : "");
  const fallback = (reason: string): ManaPlan => ({
    status: "referee",
    reason,
    cost,
  });
  if (!Number.isInteger(xValue) || xValue < 0 || xValue > 1000)
    return fallback("Choose an X value between 0 and 1000.");
  if (
    !["hand", "command"].includes(spell.zone) ||
    spell.owner !== p ||
    d.type.includes("Land") ||
    !d.manaCost
  )
    return fallback(
      "The referee will check this card’s casting permissions and payment.",
    );
  const parsed = costs(d.manaCost, xValue, tax);
  if (!parsed)
    return fallback(
      "The referee will choose payment for this special mana cost.",
    );
  // No local plan is asserted under global cost/mana changes or annotated continuous effects.
  const complex = g.cards
    .filter((c) => c.zone === "battlefield")
    .some((c) => {
      if (
        c.notes &&
        /mana|cost|cop(?:y|ies|ied)|becomes|abilities|enchanted|can.t/i.test(
          c.notes,
        )
      )
        return true;
      if (c.name === "Kinnan, Bonder Prodigy") return false;
      return /(?:spells?[^.\n]*cost|cost[^.\n]*(?:less|more)|can.t[^.\n]*(?:activat|cast|mana)|activated abilities[^.\n]*(?:can.t|cost)|(?:tap|add)[^.\n]*mana[^.\n]*(?:instead|additional|twice|three times)|nonbasic lands are|lands?[^.\n]*lose|mana[^.\n]*doesn.t empty)/i.test(
        definition(c).text,
      );
    });
  if (complex)
    return fallback(
      "A board effect may change costs or mana. The referee will optimise payment.",
    );
  const sourceGroups = availableManaSources(g, p);
  const start = pool(g.players[p].mana);
  type State = {
    mana: Pool;
    sources: ManaSource[];
    life: number;
    sacrifices: number;
    flex: number;
    creatures: number;
  };
  const initial: State = {
    mana: start,
    sources: [],
    life: 0,
    sacrifices: 0,
    flex: 0,
    creatures: 0,
  };
  const key = (s: State) => manaTypes.map((c) => s.mana[c]).join(",");
  const partial = (s: State) => [
    s.life,
    s.sacrifices,
    s.sources.length,
    s.creatures,
    s.flex,
  ];
  let states = new Map<string, State>([[key(initial), initial]]),
    best: Extract<ManaPlan, { status: "ready" }> | null = null;
  let explored = 0;
  for (let i = 0; i <= sourceGroups.length; i++) {
    const next = new Map<string, State>();
    for (const state of states.values()) {
      if (++explored > 50000)
        return fallback(
          "This board has many mana combinations. The referee will select payment.",
        );
      let paid = false;
      for (const requirement of parsed) {
        const remaining = pay(state.mana, requirement);
        if (!remaining) continue;
        paid = true;
        const score = [
          state.life,
          state.sacrifices,
          state.sources.length,
          total(remaining),
          state.creatures,
          state.flex,
        ];
        if (!best || compare(score, best.score) < 0)
          best = {
            status: "ready",
            cost,
            sources: [...state.sources].sort(
              (a, b) => Number(a.sacrifice) - Number(b.sacrifice),
            ),
            remaining,
            life: state.life,
            score,
            usedFloating: total(start) > 0,
          };
      }
      if (paid || i === sourceGroups.length) continue;
      if (
        best &&
        compare(
          [state.life, state.sacrifices, state.sources.length],
          best.score.slice(0, 3),
        ) > 0
      )
        continue;
      const candidates = [
        state,
        ...sourceGroups[i].map((source) => ({
          mana: add(state.mana, source.produces),
          sources: [...state.sources, source],
          life: state.life + source.life,
          sacrifices: state.sacrifices + Number(source.sacrifice),
          flex: state.flex + source.flexibility,
          creatures: state.creatures + Number(source.creature),
        })),
      ];
      for (const candidate of candidates) {
        if (candidate.life >= g.players[p].life && candidate.life > 0) continue;
        const id = key(candidate),
          old = next.get(id);
        if (!old || compare(partial(candidate), partial(old)) < 0)
          next.set(id, candidate);
      }
    }
    states = next;
  }
  return (
    best ??
    fallback(
      "The referee will check conditional mana sources, alternative costs or additional payment choices.",
    )
  );
}
export function manaPlanSummary(plan: ManaPlan) {
  if (plan.status !== "ready") return plan.reason;
  if (!plan.sources.length)
    return plan.usedFloating
      ? "Use mana already in your pool."
      : "No mana sources needed.";
  return (
    plan.sources
      .map(
        (s) =>
          `${s.sacrifice ? "Sacrifice" : "Tap"} ${s.name} → ${symbols(s.produces)}`,
      )
      .join(" · ") + (plan.life ? ` · Pay ${plan.life} life` : "")
  );
}
// Apply the accepted plan and cast in one transaction; a rejected cast never taps anything.
export function withManaPayment(
  game: Game,
  ruling: Ruling,
  plan: ManaPlan,
  cardId: string,
  player: PlayerId,
): Ruling {
  if (!ruling.useManaPlan) return ruling;
  if (plan.status !== "ready")
    throw new Error("No verified mana plan is available.");
  if (
    !ruling.operations.some(
      (op) => op.op === "move" && op.cardId === cardId && op.zone === "stack",
    )
  )
    throw new Error(
      "Mana payment requires a spell to be cast. No sources were tapped.",
    );
  const selected = new Set(plan.sources.map((s) => s.cardId));
  if (
    ruling.operations.some(
      (op) =>
        (op.op === "player" &&
          op.player === player &&
          (op.mana !== undefined || op.life !== undefined)) ||
        ((op.op === "card" || op.op === "move") && selected.has(op.cardId)),
    )
  )
    throw new Error(
      "The referee changed an automatic payment. No sources were tapped; retry with payment details.",
    );
  for (const source of plan.sources) {
    const c = game.cards.find((c) => c.id === source.cardId);
    if (!c || c.zone !== "battlefield" || c.controller !== player || c.tapped)
      throw new Error("A mana source is no longer available.");
  }
  const payment = plan.sources.map<Ruling["operations"][number]>((source) =>
    source.sacrifice
      ? { op: "move", cardId: source.cardId, zone: "graveyard" }
      : { op: "card", cardId: source.cardId, tapped: true },
  );
  payment.push({
    op: "player",
    player,
    mana: plan.remaining,
    ...(plan.life ? { life: game.players[player].life - plan.life } : {}),
  });
  return {
    ...ruling,
    summary: `${ruling.summary}\nAuto-tap: ${manaPlanSummary(plan)}`,
    operations: [...payment, ...ruling.operations],
  };
}
