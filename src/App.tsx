import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  decks,
  catalogue,
  newGame,
  keepHand,
  mulligan,
  cardsIn,
  definition,
  phases,
  zones,
  validateGame,
  exportGame,
  log,
  type Game,
  type Card,
  type Deck,
  type PlayerId,
} from "./lib/game";
import { Modal } from "./components/Modal";
import { CardText, CardView, Mana } from "./components/CardView";
const SAVE = "chatedh-game-v1";
function loadGame(): Game | null {
  try {
    const s = localStorage.getItem(SAVE);
    return s ? validateGame(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}
function download(name: string, text: string) {
  const u = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function ColourIdentity({ colours }: { colours: string[] }) {
  return (
    <span
      className="identity"
      aria-label={`Colour identity: ${colours.join(", ")}`}
    >
      {colours.map((c) => (
        <span key={c} className={`mana-symbol mana-${c}`}>
          {c}
        </span>
      ))}
    </span>
  );
}
function DeckList({ deck }: { deck: Deck }) {
  const [search, setSearch] = useState("");
  const entries = Object.entries(
    deck.cards.reduce<Record<string, number>>(
      (all, n) => ({ ...all, [n]: (all[n] ?? 0) + 1 }),
      {},
    ),
  )
    .filter(([name]) => name.toLowerCase().includes(search.toLowerCase()))
    .sort(
      ([a], [b]) =>
        catalogue[a].type.localeCompare(catalogue[b].type) ||
        a.localeCompare(b),
    );
  return (
    <>
      <div className="deck-summary">
        <ColourIdentity colours={deck.colours} />
        <span>
          {deck.style} · 100 cards · {deck.lands} lands
        </span>
      </div>
      <p>{deck.description}</p>
      <div className="inline-form">
        <label className="grow">
          Find a card
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Card name…"
          />
        </label>
        <button
          onClick={() => {
            const text = [
              ...deck.commanders.map((n) => `1 ${n} [Commander]`),
              ...Object.entries(
                deck.cards
                  .filter((n) => !deck.commanders.includes(n))
                  .reduce<Record<string, number>>(
                    (a, n) => ({ ...a, [n]: (a[n] ?? 0) + 1 }),
                    {},
                  ),
              ).map(([n, count]) => `${count} ${n}`),
            ].join("\n");
            download(`${deck.id}.txt`, text);
          }}
        >
          Export list
        </button>
      </div>
      <div className="deck-card-list">
        {entries.map(([n, count]) => (
          <details key={n}>
            <summary>
              <span className="quantity">{count}</span>
              <span>
                {n}
                {deck.commanders.includes(n) && <small> · Commander</small>}
              </span>
              <Mana cost={catalogue[n].manaCost} />
            </summary>
            <CardText card={catalogue[n]} />
          </details>
        ))}
      </div>
      <p className="muted small">
        {deck.source}. Card legality snapshot: {deck.verifiedAt}.{" "}
        <a href={deck.reference} target="_blank" rel="noreferrer">
          Archetype reference
        </a>
        . These are curated lists, not tournament-winning list claims.
      </p>
    </>
  );
}
export default function App() {
  const [game, setGame] = useState<Game | null>(loadGame);
  const gameRef = useRef(game);
  gameRef.current = game;
  const [screen, setScreen] = useState<"play" | "decks" | "guide">("play");
  const [yourDeck, setYourDeck] = useState("kinnan");
  const [opponentDeck, setOpponentDeck] = useState("rogsi");
  const [first, setFirst] = useState<"random" | PlayerId>("random");
  const [settings, setSettings] = useState(false);
  const [key, setKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [model, setModel] = useState(
    () =>
      localStorage.getItem("chatedh-model") ?? "anthropic/claude-sonnet-4.6",
  );
  const [serverKey, setServerKey] = useState(false);
  const [accessRequired, setAccessRequired] = useState(false);
  const [connection, setConnection] = useState("");
  const [viewDeck, setViewDeck] = useState<Deck | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zone, setZone] = useState<{
    player: PlayerId;
    zone: Card["zone"];
  } | null>(null);
  const [editor, setEditor] = useState(false);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState("");
  const [bottom, setBottom] = useState<string[]>([]);
  const [history, setHistory] = useState<Game[]>([]);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmConcede, setConfirmConcede] = useState(false);
  const [autoAi, setAutoAi] = useState(true);
  const [autoPass, setAutoPass] = useState(true);
  const [checkingPriority, setCheckingPriority] = useState(false);
  const checkedPriority = useRef<Game | null>(null);
  const [automationCount, setAutomationCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const connected = !!key || serverKey;
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => {
        setServerKey(d.serverKey);
        setAccessRequired(d.accessTokenRequired);
        setConnection("Server ready");
      })
      .catch(() => setConnection("Server unavailable. Run npm run dev."));
  }, []);
  useEffect(() => {
    try {
      if (game) localStorage.setItem(SAVE, exportGame(game));
      else localStorage.removeItem(SAVE);
    } catch {
      setNotice("Browser storage is full. Export your game to save it.");
    }
  }, [game]);
  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [game?.log.length]);
  function commit(next: Game, saveHistory = true) {
    const previous = gameRef.current;
    if (saveHistory && previous) setHistory((h) => [...h.slice(-29), previous]);
    gameRef.current = next;
    setGame(next);
    setError("");
  }
  async function play(
    text: string,
    actor: "you" | "ai" | "system" = "you",
    automatic = false,
  ) {
    const current = gameRef.current;
    if (!current || busyRef.current) return;
    if (!connected) {
      setSettings(true);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setCheckingPriority(automatic);
    if (automatic) checkedPriority.current = current;
    setError("");
    if (actor !== "ai" && !automatic) setAutomationCount(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const r = await fetch("/api/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          key,
          accessToken,
          model,
          game: current,
          action: text,
          actor,
          autoPass: automatic,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "The AI request failed.");
      if (gameRef.current !== current) return;
      if (automatic && d.autoPassed !== true) return;
      const next = validateGame(d.game);
      commit(next);
      setAction("");
      setSelected(null);
      if (actor === "ai" || automatic) setAutomationCount((c) => c + 1);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setNotice("AI request cancelled. Your game has not changed.");
        setAutoAi(false);
        setAutoPass(false);
      } else {
        setError(e instanceof Error ? e.message : "The request failed.");
        setAutoAi(false);
        setAutoPass(false);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      setCheckingPriority(false);
      abortRef.current = null;
    }
  }
  useEffect(() => {
    if (
      game?.status === "playing" &&
      game.priority === "ai" &&
      autoAi &&
      connected &&
      !busy &&
      !settings &&
      !editor &&
      automationCount < 8
    ) {
      const t = setTimeout(
        () => void play("Choose your next action.", "ai"),
        650,
      );
      return () => clearTimeout(t);
    }
  }, [game, autoAi, connected, busy, automationCount, settings, editor]);
  useEffect(() => {
    if (
      game?.status === "playing" &&
      game.priority === "you" &&
      autoPass &&
      connected &&
      !busy &&
      !settings &&
      !editor &&
      !confirmNew &&
      !confirmConcede &&
      !selected &&
      !zone &&
      screen === "play" &&
      !action.trim() &&
      automationCount < 8 &&
      checkedPriority.current !== game
    ) {
      const timer = setTimeout(
        () => void play("Check for an automatic priority pass.", "you", true),
        650,
      );
      return () => clearTimeout(timer);
    }
  }, [
    game,
    autoPass,
    connected,
    busy,
    settings,
    editor,
    confirmNew,
    confirmConcede,
    selected,
    zone,
    screen,
    action,
    automationCount,
  ]);
  function start() {
    const f =
      first === "random"
        ? crypto.getRandomValues(new Uint8Array(1))[0] % 2
          ? "you"
          : "ai"
        : first;
    const next = newGame(
      decks.find((d) => d.id === yourDeck)!,
      decks.find((d) => d.id === opponentDeck)!,
      f,
    );
    setHistory([]);
    setBottom([]);
    setAutomationCount(0);
    setAutoAi(true);
    setAutoPass(true);
    checkedPriority.current = null;
    setSelected(null);
    commit(next, false);
    setScreen("play");
    setConfirmNew(false);
  }
  function safe(fn: () => void) {
    try {
      fn();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update the game.");
    }
  }
  function undo() {
    if (!history.length || busy) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    gameRef.current = prev;
    setGame(prev);
    setAutoAi(false);
    setAutoPass(false);
    setBottom([]);
    setSelected(null);
    setError("");
    setNotice("Last action undone. Automatic play paused.");
  }
  function openEditor() {
    if (!game || busyRef.current) return;
    setAutoAi(false);
    setAutoPass(false);
    setEditText(exportGame(game));
    setEditor(true);
  }
  const selectedCard = game?.cards.find((c) => c.id === selected);
  const usable =
    !!game && game.status === "playing" && game.priority === "you" && !busy;
  function cardAction(text: string) {
    if (!selectedCard) return;
    setAction(`${text} ${selectedCard.name} [${selectedCard.id}]. `);
    setSelected(null);
  }
  const deck = decks.find((d) => d.id === yourDeck)!;
  return (
    <>
      <header className="site-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setScreen("play");
          }}
        >
          Chat<span>EDH</span>
          <span className="brand-caption">The text-only table</span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={screen === "play" ? "nav-active" : ""}
            onClick={() => setScreen("play")}
          >
            Play
          </button>
          <button
            className={screen === "decks" ? "nav-active" : ""}
            onClick={() => setScreen("decks")}
          >
            Deck library <span className="nav-count">12</span>
          </button>
          <button
            className={screen === "guide" ? "nav-active" : ""}
            onClick={() => setScreen("guide")}
          >
            How to play
          </button>
        </nav>
        <button className="connection-button" onClick={() => setSettings(true)}>
          <span className={`status-dot ${connected ? "online" : ""}`} />
          {connected ? "AI connected" : "Connect AI"}
        </button>
      </header>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {screen === "play" && !game && (
        <main className="lobby">
          <section className="intro">
            <p className="eyebrow">Commander, one on one</p>
            <h1>
              A seat at
              <br />
              the table.
            </h1>
            <p className="intro-copy">
              Your deck. Your decisions.
              <br />
              An AI opponent across the table.
            </p>
            <p className="intro-detail">
              All the card text. Every response window.
              <br />
              No artwork between you and the game.
            </p>
            <div className="rules-strip">
              <span>
                <b>40</b> starting life
              </span>
              <span>
                <b>100</b> cards per deck
              </span>
              <span>
                <b>1v1</b> Commander
              </span>
            </div>
            <div className="session-note">
              <span className="status-dot online" />
              <span>Saved in this browser. Pick up where you left off.</span>
            </div>
            <button
              className="text-button"
              onClick={() => importRef.current?.click()}
            >
              Import a saved game ↗
            </button>
          </section>
          <section className="setup">
            <div className="section-heading">
              <span className="eyebrow">New game</span>
              <span className="small muted">01 / Choose your decks</span>
            </div>
            <h2>Bring your game.</h2>
            <label>
              Your deck
              <select
                value={yourDeck}
                onChange={(e) => setYourDeck(e.target.value)}
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.style}
                  </option>
                ))}
              </select>
            </label>
            <div className="selected-deck">
              <div className="deck-summary">
                <ColourIdentity colours={deck.colours} />
                <span>{deck.style}</span>
              </div>
              <h3>{deck.commanders.join(" + ")}</h3>
              <p>{deck.description}</p>
              <button className="text-button" onClick={() => setViewDeck(deck)}>
                Read the 100 ↗
              </button>
            </div>
            <label>
              AI opponent’s deck
              <select
                value={opponentDeck}
                onChange={(e) => setOpponentDeck(e.target.value)}
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.style}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Who plays first?
              <select
                value={first}
                onChange={(e) => setFirst(e.target.value as typeof first)}
              >
                <option value="random">Random — flip a coin</option>
                <option value="you">You</option>
                <option value="ai">AI opponent</option>
              </select>
            </label>
            <button className="primary start-button" onClick={start}>
              Shuffle up & play <span>→</span>
            </button>
            <p className="setup-footnote">
              Explore your opening hand now. Connect OpenRouter to play.
              <br />
              AI adjudicates card interactions; corrections and undo are always
              available.
            </p>
          </section>
        </main>
      )}
      {screen === "decks" && (
        <main className="library-page">
          <div className="page-title">
            <div>
              <p className="eyebrow">The starting twelve</p>
              <h1>Find your line.</h1>
              <p>Competitive Commander archetypes, ready to shuffle.</p>
            </div>
            <p className="muted small">
              Full card text included.
              <br />
              Curated lists · standard Commander legality.
            </p>
          </div>
          <div className="deck-grid">
            {decks.map((d, i) => (
              <article className="deck-tile" key={d.id}>
                <div className="deck-tile-top">
                  <span className="deck-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <ColourIdentity colours={d.colours} />
                </div>
                <h2>{d.name}</h2>
                <span className="archetype">{d.style}</span>
                <p>{d.description}</p>
                <div className="tile-actions">
                  <button onClick={() => setViewDeck(d)}>View deck ↗</button>
                  <button
                    onClick={() => {
                      setYourDeck(d.id);
                      if (game) setConfirmNew(true);
                      else setScreen("play");
                    }}
                  >
                    Play this deck
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className="small muted">
            cEDH decks are built for multiplayer. Matchups and card value change
            in a duel. Lists are authored for ChatEDH around{" "}
            <a
              href="https://cedh-decklist-database.com/"
              target="_blank"
              rel="noreferrer"
            >
              established cEDH archetypes
            </a>
            ; they are not attributed tournament lists.
          </p>
        </main>
      )}
      {screen === "guide" && (
        <main className="guide-page">
          <p className="eyebrow">Before the first land drop</p>
          <h1>
            Same game.
            <br />A quieter table.
          </h1>
          <div className="guide-grid">
            <section>
              <h2>01. Connect your opponent</h2>
              <p>
                Open connection settings and enter your OpenRouter key. Choose a
                model that supports JSON output. Your key stays in memory in
                this tab and is sent through the local server to OpenRouter. It
                is never included in saved games.
              </p>
              <h2>02. Keep your seven</h2>
              <p>
                Choose from 12 decks for each seat. Games start at 40 life.
                London mulligans draw seven, then you choose one card to bottom
                for each mulligan. Two players means no free mulligan; the
                starting player skips their first draw.
              </p>
              <h2>03. Make your move</h2>
              <p>
                Click a card to read it and prepare a cast, activation or
                attack. Add targets, modes and payment in the action box, then
                submit. You can also type any legal action: “Cast Sol Ring using
                one colourless mana” or “Block the attacking Warrior with Birds
                of Paradise”.
              </p>
            </section>
            <section>
              <h2>04. Keep priority in mind</h2>
              <p>
                Auto-pass is on by default. The referee checks for legal actions
                and passes for you when none are available. Choices and
                uncertain rulings keep priority with you. You can pause
                auto-pass or use Pass priority yourself. Casting and resolution
                are separate. Both players must pass before the top stack item
                resolves or the phase advances. Each AI action stops for your
                response when appropriate.
              </p>
              <h2>05. Play through to a result</h2>
              <p>
                The table tracks zones, life, mana, poison, commander casts and
                commander damage. Tutors, tokens, combat assignments, triggers,
                replacement effects and combo shortcuts can be described in the
                action box. Use an explicit finite number of combo iterations.
              </p>
              <h2>06. Make a correction</h2>
              <p>
                AI handles card rulings and can make mistakes. Check the log,
                undo a ruling, or open Edit state to correct life, zones,
                counters, tokens or the stack. Pause autoplay while correcting.
                This is an AI-adjudicated tabletop, not a certified Magic rules
                engine.
              </p>
            </section>
          </div>
          <div className="guide-note">
            <h3>Your game stays with you.</h3>
            <p>
              Games save automatically in this browser. Export a JSON save to
              transfer or back up your table. Saves contain both hands and
              libraries, so opening one reveals hidden information. Reloading
              clears your API key; reconnect to continue.
            </p>
            <p>
              Each action can use multiple paid model calls. The opponent
              receives its own hand and public state; the separate referee
              receives both hands and unordered library contents to adjudicate
              effects. OpenRouter and the selected provider process that data.
            </p>
          </div>
        </main>
      )}
      {screen === "play" && game && (
        <main className="game-page">
          <div className="game-toolbar">
            <div>
              <span className="eyebrow">
                {game.status === "mulligan"
                  ? "Opening hands"
                  : game.status === "finished"
                    ? "Game complete"
                    : `Turn ${game.turn}`}
              </span>
              <strong>
                {decks.find((d) => d.id === game.players.you.deckId)?.name}{" "}
                <span className="muted">vs</span>{" "}
                {decks.find((d) => d.id === game.players.ai.deckId)?.name}
              </strong>
            </div>
            <div className="toolbar-actions">
              <button disabled={busy || !history.length} onClick={undo}>
                Undo
              </button>
              <button disabled={busy} onClick={openEditor}>
                Edit state
              </button>
              <button
                onClick={() => download("chatedh-save.json", exportGame(game))}
              >
                Export
              </button>
              <button disabled={busy} onClick={() => setConfirmNew(true)}>
                New game
              </button>
            </div>
          </div>
          <div className="table-layout">
            <div className="table-main">
              <PlayerBar
                game={game}
                player="ai"
                onZone={(z) => setZone({ player: "ai", zone: z })}
                onEdit={openEditor}
              />
              <Battlefield game={game} player="ai" select={setSelected} />
              <div className="phase-bar" aria-label="Turn phases">
                {[
                  "Upkeep",
                  "Draw",
                  "Main 1",
                  "Begin combat",
                  "Attackers",
                  "Blockers",
                  "Combat damage",
                  "Main 2",
                  "End step",
                  "Cleanup",
                ].map((p) => (
                  <span key={p} className={game.phase === p ? "current" : ""}>
                    {p === "Begin combat"
                      ? "Combat"
                      : p === "Combat damage"
                        ? "Damage"
                        : p}
                  </span>
                ))}
              </div>
              <div className="table-status">
                <span>
                  {game.active === "you" ? "Your turn" : "Opponent’s turn"}
                </span>
                <span>
                  {busy
                    ? checkingPriority
                      ? "Checking your legal actions…"
                      : "AI is considering the table…"
                    : game.status === "playing"
                      ? `${game.priority === "you" ? "You have" : "AI has"} priority`
                      : game.status === "mulligan"
                        ? "Choose your opening hand"
                        : "Game over"}
                </span>
                <span>{game.stack.length} on the stack</span>
              </div>
              <Battlefield game={game} player="you" select={setSelected} />
              <PlayerBar
                game={game}
                player="you"
                onZone={(z) => setZone({ player: "you", zone: z })}
                onEdit={openEditor}
              />
              <section className="hand-zone">
                <div className="section-heading">
                  <h2>
                    Your hand <span>{cardsIn(game, "you", "hand").length}</span>
                  </h2>
                  <span className="small muted">
                    {game.status === "mulligan" && game.players.you.mulligans
                      ? `Select ${game.players.you.mulligans} to bottom · ${bottom.length} selected`
                      : "Select a card to read or play"}
                  </span>
                </div>
                <div className="hand-cards">
                  {cardsIn(game, "you", "hand").map((c) => (
                    <CardView
                      key={c.id}
                      card={c}
                      selected={bottom.includes(c.id)}
                      onClick={() => {
                        if (
                          game.status === "mulligan" &&
                          game.players.you.mulligans
                        )
                          setBottom((b) =>
                            b.includes(c.id)
                              ? b.filter((id) => id !== c.id)
                              : [...b, c.id],
                          );
                        else setSelected(c.id);
                      }}
                    />
                  ))}
                  {!cardsIn(game, "you", "hand").length && (
                    <p className="empty">Your hand is empty.</p>
                  )}
                </div>
              </section>
              {game.status === "mulligan" ? (
                <div className="mulligan-bar">
                  <div>
                    <strong>Make the opening count.</strong>
                    <p>
                      {game.players.you.mulligans
                        ? `Keep ${7 - game.players.you.mulligans} after putting ${game.players.you.mulligans} on the bottom.`
                        : "Seven cards. No free mulligan in a two-player game."}
                    </p>
                  </div>
                  <button
                    disabled={game.players.you.mulligans >= 7}
                    onClick={() =>
                      safe(() => {
                        commit(mulligan(game));
                        setBottom([]);
                      })
                    }
                  >
                    Mulligan
                  </button>
                  <button
                    className="primary"
                    disabled={bottom.length !== game.players.you.mulligans}
                    onClick={() =>
                      safe(() => {
                        commit(keepHand(game, bottom));
                        setBottom([]);
                      })
                    }
                  >
                    Keep {7 - game.players.you.mulligans}
                  </button>
                </div>
              ) : game.status === "finished" ? (
                <div className="game-result" role="status">
                  <h2>
                    {game.winner === null
                      ? "A draw."
                      : game.winner === "you"
                        ? "The table is yours."
                        : "This one goes to the opponent."}
                  </h2>
                  <p>{game.reason}</p>
                  <button
                    className="primary"
                    onClick={() => setConfirmNew(true)}
                  >
                    Another game →
                  </button>
                </div>
              ) : (
                <section className="action-panel">
                  <p className="decision-prompt" aria-live="polite">
                    {game.prompt}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void play(action);
                    }}
                  >
                    <label className="sr-only" htmlFor="game-action">
                      Your action, targets and mana payment
                    </label>
                    <textarea
                      id="game-action"
                      rows={2}
                      value={action}
                      onChange={(e) => setAction(e.target.value)}
                      placeholder="Describe your action, targets and mana payment…"
                      disabled={!usable}
                    />
                    <div className="action-buttons">
                      <button
                        className="primary"
                        disabled={!usable || !action.trim()}
                        type="submit"
                      >
                        Submit action ↗
                      </button>
                      <button
                        type="button"
                        disabled={!usable}
                        onClick={() =>
                          void play(
                            "Pass priority. I take no action. Only resolve the top stack item or advance one step if both players have passed.",
                          )
                        }
                      >
                        Pass priority
                      </button>
                      <button
                        type="button"
                        disabled={!usable}
                        onClick={() => setAction("Declare attackers: ")}
                      >
                        Attack
                      </button>
                      <button
                        type="button"
                        disabled={!usable}
                        onClick={() => setAction("Declare blockers: ")}
                      >
                        Block
                      </button>
                      <span className="grow" />
                      {busy ? (
                        <button
                          type="button"
                          onClick={() => abortRef.current?.abort()}
                        >
                          Cancel request
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setConfirmConcede(true)}
                        >
                          Concede
                        </button>
                      )}
                    </div>
                  </form>
                </section>
              )}
            </div>
            <aside className="game-sidebar">
              <section className="opponent-panel">
                <div className="section-heading">
                  <h2>Across the table</h2>
                  <span className={`status-dot ${connected ? "online" : ""}`} />
                </div>
                <p className="model-label">{model.split("/")[1]}</p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={autoAi}
                    onChange={(e) => {
                      setAutoAi(e.target.checked);
                      setAutomationCount(0);
                    }}
                  />{" "}
                  AI autoplay
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={autoPass}
                    onChange={(e) => {
                      setAutoPass(e.target.checked);
                      setAutomationCount(0);
                      if (e.target.checked) checkedPriority.current = null;
                      else if (checkingPriority) abortRef.current?.abort();
                    }}
                  />
                  Auto-pass when no legal actions
                </label>
                <p className="small muted">
                  Priority passes automatically only when the referee finds no
                  legal action or pending choice.
                </p>
                {!connected && (
                  <button className="primary" onClick={() => setSettings(true)}>
                    Connect OpenRouter
                  </button>
                )}
                {game.priority === "ai" &&
                  !busy &&
                  game.status === "playing" && (
                    <button
                      onClick={() => {
                        setAutomationCount(0);
                        void play("Choose your next action.", "ai");
                      }}
                    >
                      {" "}
                      {automationCount >= 8
                        ? "Continue AI turn"
                        : "Ask AI to act"}{" "}
                      →
                    </button>
                  )}
                {automationCount >= 8 && (
                  <p className="small">
                    Automatic play paused after 8 actions.
                    <button
                      disabled={busy}
                      onClick={() => setAutomationCount(0)}
                    >
                      Continue automatic play
                    </button>
                  </p>
                )}
              </section>
              <section className="stack-panel">
                <div className="section-heading">
                  <h2>The stack</h2>
                  <span>{game.stack.length}</span>
                </div>
                {game.stack.length ? (
                  [...game.stack].reverse().map((s, i) => (
                    <div className="stack-item" key={s.id}>
                      <span className="eyebrow">
                        {i === 0 ? "Resolves next" : `Position ${i + 1}`} ·{" "}
                        {s.controller === "you" ? "You" : "AI"}
                      </span>
                      <strong>{s.label}</strong>
                      <p>{s.details}</p>
                    </div>
                  ))
                ) : (
                  <p className="empty">
                    The stack is clear.
                    <br />A little room to think.
                  </p>
                )}
              </section>
              <section className="log-panel">
                <div className="section-heading">
                  <h2>Game log</h2>
                  <button
                    className="text-button"
                    onClick={() =>
                      download(
                        "chatedh-log.txt",
                        game.log
                          .map((l) => `Turn ${l.turn} · ${l.actor}: ${l.text}`)
                          .join("\n\n"),
                      )
                    }
                  >
                    Save ↗
                  </button>
                </div>
                <div
                  className="log-entries"
                  ref={logRef}
                  role="log"
                  aria-live="polite"
                >
                  {game.log.map((l) => (
                    <article key={l.id}>
                      <span>
                        Turn {l.turn} ·{" "}
                        {l.actor === "you"
                          ? "You"
                          : l.actor === "ai"
                            ? "Opponent"
                            : "Table"}
                      </span>
                      <p>{l.text}</p>
                    </article>
                  ))}
                </div>
              </section>
              <p className="sidebar-note">
                AI-adjudicated play. Check rulings; undo or edit whenever
                needed.
              </p>
            </aside>
          </div>
        </main>
      )}
      <footer className="site-footer">
        <span>
          ChatEDH <span className="muted">/ All text. All decisions.</span>
        </span>
        <span>
          Unofficial fan project. Not affiliated with Wizards of the Coast.
        </span>
      </footer>
      <input
        className="sr-only"
        type="file"
        accept=".json"
        ref={importRef}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 3_000_000)
              throw new Error("Save files must be under 3 MB.");
            const g = validateGame(JSON.parse(await file.text()));
            commit(g);
            setScreen("play");
            setAutoAi(false);
            setAutoPass(false);
            setBottom([]);
            setNotice("Game imported. Automatic play paused.");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid save.");
          }
          e.target.value = "";
        }}
      />
      {viewDeck && (
        <Modal title={viewDeck.name} onClose={() => setViewDeck(null)} wide>
          <DeckList deck={viewDeck} />
        </Modal>
      )}
      {settings && (
        <Modal title="Connect your opponent" onClose={() => setSettings(false)}>
          <p>
            Bring an OpenRouter API key and choose who sits across the table.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              localStorage.setItem("chatedh-model", model);
              setSettings(false);
              setNotice(
                key || serverKey
                  ? "Connection settings saved. The key will be checked on your first action."
                  : "API key cleared.",
              );
            }}
          >
            <label>
              OpenRouter API key
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  serverKey
                    ? "Server key available — optional override"
                    : "sk-or-v1-…"
                }
              />
            </label>
            <p className="small muted">
              Kept only in this tab’s memory. Refreshing clears it.{" "}
              <a
                href="https://openrouter.ai/settings/keys"
                target="_blank"
                rel="noreferrer"
              >
                Get a key ↗
              </a>
            </p>
            {accessRequired && (
              <label>
                Server access token
                <input
                  type="password"
                  autoComplete="off"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                />
              </label>
            )}
            <label>
              Model
              <select
                value={
                  [
                    "anthropic/claude-sonnet-4.6",
                    "google/gemini-2.5-flash",
                    "openai/gpt-5-mini",
                  ].includes(model)
                    ? model
                    : "custom"
                }
                onChange={(e) =>
                  setModel(e.target.value === "custom" ? "" : e.target.value)
                }
              >
                <option value="anthropic/claude-sonnet-4.6">
                  Claude Sonnet 4.6
                </option>
                <option value="google/gemini-2.5-flash">
                  Gemini 2.5 Flash
                </option>
                <option value="openai/gpt-5-mini">GPT-5 mini</option>
                <option value="custom">Custom model ID</option>
              </select>
            </label>
            <label>
              OpenRouter model ID
              <input
                value={model}
                required
                onChange={(e) => setModel(e.target.value)}
                placeholder="provider/model-name"
              />
            </label>
            <div className="connection-note">
              <strong>{connection || "Checking local server…"}</strong>
              <p>
                Each action uses paid API requests. The AI opponent sees its own
                hand and public state. A separate referee call sees both hands
                to resolve card interactions.
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setKey("");
                  setAccessToken("");
                  setAutoAi(false);
                  setAutoPass(false);
                  setNotice("Browser key cleared.");
                }}
              >
                Clear key
              </button>
              <button className="primary" type="submit">
                Save connection
              </button>
            </div>
          </form>
        </Modal>
      )}
      {selectedCard && (
        <Modal title="Card details" onClose={() => setSelected(null)}>
          <div className="card-detail">
            <CardText card={definition(selectedCard)} />
            <p className="small muted">
              {selectedCard.id} ·{" "}
              {selectedCard.owner === "you" ? "Your" : "Opponent’s"}{" "}
              {selectedCard.zone}
              {selectedCard.commander
                ? ` · Commander tax: ${(game!.players[selectedCard.owner].commanderCasts[selectedCard.id] ?? 0) * 2}`
                : ""}
            </p>
            {selectedCard.notes && (
              <p className="card-notes">{selectedCard.notes}</p>
            )}
            {Object.entries(selectedCard.counters).map(([n, v]) => (
              <p key={n}>
                {n}: {v}
              </p>
            ))}
          </div>
          {usable && (
            <div className="card-actions">
              {(selectedCard.zone === "hand" ||
                selectedCard.zone === "command" ||
                selectedCard.zone === "graveyard" ||
                selectedCard.zone === "exile") && (
                <button
                  className="primary"
                  onClick={() =>
                    cardAction(
                      definition(selectedCard).type.includes("Land")
                        ? "Play"
                        : "Cast",
                    )
                  }
                >
                  Prepare{" "}
                  {definition(selectedCard).type.includes("Land")
                    ? "land play"
                    : "cast"}
                </button>
              )}
              {selectedCard.zone === "battlefield" && (
                <>
                  <button onClick={() => cardAction("Activate an ability of")}>
                    Activate ability
                  </button>
                  <button onClick={() => cardAction("Tap for mana:")}>
                    Tap for mana
                  </button>
                  {definition(selectedCard).type.includes("Creature") && (
                    <button onClick={() => cardAction("Declare as attacker:")}>
                      Attack with this
                    </button>
                  )}
                </>
              )}
              <button onClick={() => cardAction("Choose as target:")}>
                Use as target
              </button>
            </div>
          )}
          <p className="small muted">
            Use the action box for modes, targets, alternative costs, abilities,
            or any other legal action.
          </p>
          {definition(selectedCard).scryfallUrl && (
            <a
              className="small"
              href={definition(selectedCard).scryfallUrl}
              target="_blank"
              rel="noreferrer"
            >
              Card source on Scryfall ↗
            </a>
          )}
        </Modal>
      )}
      {zone && game && (
        <Modal
          title={`${zone.player === "you" ? "Your" : "Opponent’s"} ${zone.zone}`}
          onClose={() => setZone(null)}
          wide
        >
          {zone.zone === "library" && (
            <p className="small muted">
              Only cards an effect lets you look at appear here. Library count:{" "}
              {cardsIn(game, zone.player, "library").length}.
            </p>
          )}
          <div className="zone-cards">
            {cardsIn(game, zone.player, zone.zone)
              .filter((c) =>
                zone.zone === "library"
                  ? c.revealed && zone.player === "you"
                  : zone.zone === "hand" && zone.player === "ai"
                    ? c.revealed
                    : true,
              )
              .map((c) => (
                <CardView
                  card={c}
                  key={c.id}
                  onClick={() => {
                    setZone(null);
                    setSelected(c.id);
                  }}
                />
              ))}
          </div>
          {!cardsIn(game, zone.player, zone.zone).filter((c) =>
            zone.zone === "library"
              ? c.revealed && zone.player === "you"
              : zone.zone === "hand" && zone.player === "ai"
                ? c.revealed
                : true,
          ).length && <p className="empty">No visible cards in this zone.</p>}
        </Modal>
      )}
      {editor && game && (
        <Modal title="Correct the table" onClose={() => setEditor(false)} wide>
          <StateEditor
            game={game}
            onSave={(next) => {
              safe(() => {
                const g = validateGame(next);
                log(
                  g,
                  "system",
                  "Manual state correction applied. Automatic play paused.",
                );
                commit(g);
                setEditor(false);
              });
            }}
            json={editText}
            setJson={setEditText}
          />
        </Modal>
      )}
      {confirmNew && (
        <Modal title="Set up another game" onClose={() => setConfirmNew(false)}>
          <p>
            Your current game will be replaced. Export it first if you want to
            return to this table.
          </p>
          <div className="modal-actions">
            <button
              onClick={() => {
                if (game) download("chatedh-save.json", exportGame(game));
              }}
            >
              Export current game
            </button>
            <button
              className="primary"
              onClick={() => {
                setGame(null);
                gameRef.current = null;
                setScreen("play");
                setConfirmNew(false);
                setHistory([]);
                setSelected(null);
              }}
            >
              Choose decks →
            </button>
          </div>
        </Modal>
      )}
      {confirmConcede && (
        <Modal
          title="Concede this game?"
          onClose={() => setConfirmConcede(false)}
        >
          <p>
            The opponent wins this game. You can review the table and log
            afterwards.
          </p>
          <div className="modal-actions">
            <button onClick={() => setConfirmConcede(false)}>
              Keep playing
            </button>
            <button
              className="primary"
              onClick={() => {
                if (game) {
                  const g = structuredClone(game);
                  g.status = "finished";
                  g.winner = "ai";
                  g.reason = "You conceded the game.";
                  log(g, "you", "Conceded.");
                  commit(g);
                }
                setConfirmConcede(false);
              }}
            >
              Concede
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Battlefield({
  game,
  player,
  select,
}: {
  game: Game;
  player: PlayerId;
  select: (id: string) => void;
}) {
  const cards = cardsIn(game, player, "battlefield");
  const lands = cards.filter((c) => definition(c).type.includes("Land"));
  const nonlands = cards.filter((c) => !definition(c).type.includes("Land"));
  return (
    <section
      className={`battlefield ${player === "ai" ? "opponent-field" : "your-field"}`}
      aria-label={`${player === "ai" ? "Opponent" : "Your"} battlefield`}
    >
      <div className="field-label">
        {player === "you" ? "Your battlefield" : "Opponent’s battlefield"}{" "}
        <span>{cards.length} permanents</span>
      </div>
      {!cards.length ? (
        <div className="field-empty">
          {player === "you"
            ? "Your next move starts here."
            : "The opponent’s battlefield is clear."}
        </div>
      ) : (
        <>
          {!!nonlands.length && (
            <div className="permanents">
              {nonlands.map((c) => (
                <CardView card={c} key={c.id} onClick={() => select(c.id)} />
              ))}
            </div>
          )}
          {!!lands.length && (
            <div className="land-row">
              {lands.map((c) => (
                <button
                  key={c.id}
                  className={`land-card ${c.tapped ? "tapped" : ""}`}
                  onClick={() => select(c.id)}
                >
                  <strong>{c.name}</strong>
                  <span>{c.tapped ? "Tapped" : "Untapped"}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
function PlayerBar({
  game,
  player,
  onZone,
  onEdit,
}: {
  game: Game;
  player: PlayerId;
  onZone: (zone: Card["zone"]) => void;
  onEdit: () => void;
}) {
  const p = game.players[player];
  return (
    <section
      className={`player-bar ${game.active === player ? "active-player" : ""}`}
      aria-label={`${player === "you" ? "Your" : "Opponent"} player information`}
    >
      <div className="life-total">
        <span>{player === "you" ? "You" : "Opponent"}</span>
        <strong>{p.life}</strong>
        <span>life</span>
      </div>
      <div className="player-data">
        <strong>{decks.find((d) => d.id === p.deckId)?.name}</strong>
        <div className="mana-pool" aria-label="Mana pool">
          {["W", "U", "B", "R", "G", "C"].map((c) => (
            <span key={c}>
              <span className={`mana-symbol mana-${c}`}>{c}</span>
              {p.mana[c] ?? 0}
            </span>
          ))}
        </div>
        <button className="text-button small" onClick={onEdit}>
          Poison {p.poison} · Commander damage{" "}
          {Object.values(p.commanderDamage).reduce((a, b) => a + b, 0)} ↗
        </button>
      </div>
      <div className="zone-buttons">
        {(["command", "library", "hand", "graveyard", "exile"] as const).map(
          (z) => (
            <button key={z} onClick={() => onZone(z)}>
              <span>
                {z === "command"
                  ? "Command"
                  : z === "graveyard"
                    ? "Graveyard"
                    : z === "library"
                      ? "Library"
                      : z === "hand"
                        ? "Hand"
                        : "Exile"}
              </span>
              <b>{cardsIn(game, player, z).length}</b>
            </button>
          ),
        )}
      </div>
    </section>
  );
}
function StateEditor({
  game,
  onSave,
  json,
  setJson,
}: {
  game: Game;
  onSave: (g: unknown) => void;
  json: string;
  setJson: (s: string) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(game));
  const [tab, setTab] = useState<"quick" | "json">("quick");
  const [error, setError] = useState("");
  const [cardId, setCardId] = useState("");
  const [search, setSearch] = useState("");
  const chosen = draft.cards.find((c) => c.id === cardId);
  function changeCard(patch: Partial<Card>) {
    setDraft((g) => ({
      ...g,
      cards: g.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
    }));
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const value = tab === "json" ? JSON.parse(json) : draft;
      onSave(validateGame(value));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid state.");
    }
  }
  return (
    <form onSubmit={submit}>
      <p>
        Automatic play is paused. Corrections are logged and can be undone. The
        advanced editor contains both hands and libraries.
      </p>
      <div className="editor-tabs">
        <button
          type="button"
          className={tab === "quick" ? "active" : ""}
          onClick={() => {
            if (tab === "json") {
              try {
                setDraft(validateGame(JSON.parse(json)));
                setTab("quick");
                setError("");
              } catch {
                setError("Fix the JSON before switching editors.");
              }
            }
          }}
        >
          Quick corrections
        </button>
        <button
          type="button"
          className={tab === "json" ? "active" : ""}
          onClick={() => {
            setJson(exportGame(draft));
            setTab("json");
          }}
        >
          Advanced JSON
        </button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {tab === "json" ? (
        <label>
          Complete game state
          <textarea
            className="json-editor"
            rows={22}
            value={json}
            onChange={(e) => setJson(e.target.value)}
            spellCheck={false}
          />
        </label>
      ) : (
        <>
          <div className="editor-players">
            {(["you", "ai"] as const).map((p) => (
              <fieldset key={p}>
                <legend>{p === "you" ? "You" : "Opponent"}</legend>
                {(["life", "poison"] as const).map((field) => (
                  <label key={field}>
                    {field === "life" ? "Life" : "Poison"}
                    <input
                      type="number"
                      value={draft.players[p][field]}
                      onChange={(e) =>
                        setDraft((g) => ({
                          ...g,
                          players: {
                            ...g.players,
                            [p]: {
                              ...g.players[p],
                              [field]: Number(e.target.value),
                            },
                          },
                        }))
                      }
                    />
                  </label>
                ))}
                <label>
                  Mana (JSON)
                  <input
                    defaultValue={JSON.stringify(draft.players[p].mana)}
                    onBlur={(e) => {
                      try {
                        const mana = JSON.parse(e.target.value);
                        setDraft((g) => ({
                          ...g,
                          players: {
                            ...g.players,
                            [p]: { ...g.players[p], mana },
                          },
                        }));
                        setError("");
                      } catch {
                        setError(
                          'Mana must be a JSON object, for example {"U":2,"C":1}.',
                        );
                      }
                    }}
                  />
                </label>
                <label>
                  Commander damage received (JSON)
                  <input
                    defaultValue={JSON.stringify(
                      draft.players[p].commanderDamage,
                    )}
                    onBlur={(e) => {
                      try {
                        const commanderDamage = JSON.parse(e.target.value);
                        setDraft((g) => ({
                          ...g,
                          players: {
                            ...g.players,
                            [p]: { ...g.players[p], commanderDamage },
                          },
                        }));
                        setError("");
                      } catch {
                        setError(
                          "Commander damage must be a JSON object keyed by commander card ID.",
                        );
                      }
                    }}
                  />
                </label>
              </fieldset>
            ))}
          </div>
          <div className="inline-form">
            <label className="grow">
              Phase
              <select
                value={draft.phase}
                onChange={(e) =>
                  setDraft((g) => ({
                    ...g,
                    phase: e.target.value as Game["phase"],
                  }))
                }
              >
                {phases.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="grow">
              Priority
              <select
                value={draft.priority}
                onChange={(e) =>
                  setDraft((g) => ({
                    ...g,
                    priority: e.target.value as PlayerId,
                  }))
                }
              >
                <option value="you">You</option>
                <option value="ai">Opponent</option>
              </select>
            </label>
          </div>
          <label>
            Find a visible card
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label>
            Card
            <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
              <option value="">Choose a card…</option>
              {draft.cards
                .filter(
                  (c) =>
                    c.zone !== "library" &&
                    (c.zone !== "hand" || c.owner === "you" || c.revealed) &&
                    c.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.id} · {c.zone}
                  </option>
                ))}
            </select>
          </label>
          {chosen && (
            <>
              <div className="inline-form">
                <label className="grow">
                  Zone
                  <select
                    value={chosen.zone}
                    onChange={(e) =>
                      changeCard({ zone: e.target.value as Card["zone"] })
                    }
                  >
                    {zones.map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <label className="grow">
                  Damage
                  <input
                    type="number"
                    value={chosen.damage}
                    onChange={(e) =>
                      changeCard({ damage: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={chosen.tapped}
                  onChange={(e) => changeCard({ tapped: e.target.checked })}
                />
                Tapped
              </label>
              <label>
                Notes / ongoing effects
                <textarea
                  value={chosen.notes}
                  onChange={(e) => changeCard({ notes: e.target.value })}
                />
              </label>
              <label>
                Counters (JSON)
                <input
                  key={chosen.id}
                  defaultValue={JSON.stringify(chosen.counters)}
                  onBlur={(e) => {
                    try {
                      changeCard({ counters: JSON.parse(e.target.value) });
                      setError("");
                    } catch {
                      setError(
                        'Counters must be a JSON object, for example {"+1/+1":2}.',
                      );
                    }
                  }}
                />
              </label>
            </>
          )}
        </>
      )}
      <div className="modal-actions">
        <span className="small muted">Changes apply together.</span>
        <button className="primary" disabled={!!error} type="submit">
          Apply correction
        </button>
      </div>
    </form>
  );
}
