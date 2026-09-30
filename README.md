# ChatEDH

A text-only web tabletop for playing two-player Commander against an OpenRouter-powered opponent. Includes twelve curated cEDH archetypes, bundled Oracle card text, a stack, all normal zones, London mulligans, a turn tracker, game logs, saved games, undo and a state editor. There is no card artwork.

ChatEDH uses **AI adjudication**, not a complete deterministic implementation of Magic’s comprehensive rules. The model judges legality, pays costs, handles triggers, resolves combat and card effects, and maintains priority. The application validates state changes and applies each response atomically. Rulings can be wrong: inspect the log, undo, or correct the state. This trade-off lets the tabletop represent full games and arbitrary card interactions without pretending every rule has been programmed.

## Run locally

Requires Node.js 22.12+ (an active LTS release is recommended).

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Choose your decks and inspect an opening hand without a key. To play, choose **Connect AI**, enter an [OpenRouter API key](https://openrouter.ai/settings/keys), and select a model supporting JSON output. Requests consume your OpenRouter credits. Model quality affects rulings and opponent play.

The Vite frontend proxies `/api` to the Express server on port 3001. The development frontend binds to all interfaces; the API server binds to loopback. For a local-only frontend, replace `--host 0.0.0.0` with `--host 127.0.0.1` in the dev script.

Alternatively, copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. The server loads `.env` automatically. If exposing an instance with a server-funded key, set `CHATEDH_ACCESS_TOKEN` and place it behind HTTPS and access control. This is a local single-user application, not a hosted multi-user service.

```sh
npm run build
npm start
```

The production app is served at **http://localhost:3001**. Port can be changed with `PORT`.

## Playing

1. Select both decks and the starting player. Both players begin at 40 life.
2. Keep seven or take London mulligans. Every mulligan costs one card in two-player play; select the cards to bottom before keeping. The opponent currently keeps its initial seven.
3. Inspect a card and prepare a cast, land play or activation. Add targets, modes and payment in the action box. Natural-language actions also cover tutors, alternative costs, triggered abilities, combat assignments and finite combo shortcuts.
4. Auto-pass is enabled by default. Whenever you receive priority, a separate referee check looks for legal actions. If none exist and no decision is pending, the app submits one ordinary pass for you and records it in the log. Free spells, mana abilities and actions from other zones count; pending choices or uncertainty keep priority with you. Disable **Auto-pass when no legal actions** to hold priority manually, or use **Pass priority** yourself. The AI should stop at your response windows. Both players passing resolves the top stack item or advances a step, as adjudicated by the referee. Automatic play pauses after eight consecutive AI actions or automatic passes; choose **Continue automatic play** to resume.
5. Read the public log. Use **Undo** or **Edit state** for corrections. These pause both AI autoplay and auto-pass, as do imports, cancellations and API errors. The quick editor changes life, poison, mana, commander damage, phases, priority, zones, tap state, damage, notes and counters. The advanced editor exposes the whole state, including tokens, the stack, commander casts, effects and the result.
6. Games automatically save in this browser. Export a save to back up or transfer a game; import from the setup screen. Exported saves contain both hands and libraries. To replace an active game with an import, export it first, choose New game, then import.

The first player skips the first draw. Commander damage is recorded separately for each commander, with 21 combat damage from one commander lethal. Ten poison, zero life and drawing from an empty library are tracked; simultaneous lethal life/poison/commander damage produces a draw. The referee can set `cantLose` for effects preventing a loss. Commander tax is recorded per commander. Notes represent ongoing effects, chosen modes, attachments, copies, attack and block assignments and temporary characteristics. These effects depend on the referee rather than on dedicated engine implementations.

## Deck library

- Kinnan — infinite mana
- RogSi (Rograkh / Silas Renn) — turbo combo
- Blue Farm (Tymna / Kraum) — midrange combo
- Yuriko — tempo
- Magda — artifact combo
- Sisay — legendary toolbox
- Najeela — combat combo
- Tivit — control combo
- Talion — draw-go control
- Niv-Mizzet, Parun — Curiosity control
- Thrasios / Tymna — value combo
- Winota — stax and combat

These are ChatEDH-authored lists based on established competitive archetypes, not claimed copies of winning tournament lists. They are optimised starting points, not guarantees of current metagame strength. Multiplayer cEDH strategies behave differently in a duel; in particular, Tivit generates only three voting artifacts from one trigger with two players, so Time Sieve needs additional fodder.

All decks have 100 cards including commanders, legal colour identities and singleton nonbasic cards. Legality is a bundled Scryfall snapshot, dated in each deck. Runtime play does not fetch card data. `npm run decks:refresh` rebuilds the lists and data using Scryfall; remove the optional `scripts/card-cache.json` first to refresh cached Oracle text and legality. Run tests after rebuilding. Refreshing does not automatically tune a strategy when the ban list or metagame changes.

## AI and privacy

- A browser-entered key lives only in React memory. It is sent to the local server and then to OpenRouter; it is not written to local storage, save files, or application logs. Reloading requires reconnecting. A server key lives in your environment.
- The opponent request receives its own hand and public state. It receives neither the human’s hidden hand nor the order of either library.
- A separate referee request receives both hands, public state and **alphabetically sorted** library contents. Draws and shuffles use local cryptographic randomness. `peek` reveals only the requested number of cards to their owner and the referee; the opponent can see its own peeks only.
- Referee summaries must be public information. As with other model instructions, this is not a formal information-flow guarantee. This is a single-user local tabletop, not a secure competitive multiplayer service.
- Model output is parsed and validated with Zod, then applied to a clone. Invalid operations, API errors and interrupted resolutions leave the original game unchanged. New non-token cards cannot be invented by operation output. An action can use up to five referee stages; AI actions also need a separate decision call. Checking human priority adds one referee call per checked state; a confirmed automatic pass then uses the normal adjudication calls. Read-only checks do not alter the state, log or undo history, and a state with available actions is not repeatedly checked. No automatic calls run without a connection or while editing, inspecting cards, typing an action or viewing connection settings. Each request has a two-minute deadline and can be cancelled.
- OpenRouter and your selected provider process the transmitted game context under their respective policies. No analytics are included. Fonts are requested from Google Fonts with local fallbacks.

## Verification

```sh
npm test
npm run test:e2e
npm run build
```

Browser tests require Chromium (`npx playwright install chromium`). They cover desktop and mobile setup, deck browsing, mulligans, correction, undo, persistence, connection settings, provider failure, a stubbed game result and key storage boundaries. Unit and API tests cover deck construction, state operations, hidden information, loss conditions and atomic API failures. Provider tests use stub responses; a real model’s ability to finish an accurate game has not been certified.

## Project layout

- `src/App.tsx`, `src/components/`, `src/styles.css`: React interface.
- `src/lib/game.ts`: game types, validation, local operations and information views.
- `src/data/`: bundled decks and text-only card definitions.
- `server/index.ts`: same-origin OpenRouter bridge and production server.
- `server/prompts.ts`: opponent and referee instructions.
- `scripts/build-decks.mjs`: reproducible deck construction and Scryfall data import.
- `tests/`, `e2e/`: unit, server and browser tests.

## References

Deck archetypes: [cEDH Decklist Database](https://cedh-decklist-database.com/). Card text and legality data: [Scryfall API](https://scryfall.com/docs/api). Format bans: [Wizards of the Coast banned and restricted list](https://magic.wizards.com/en/banned-restricted-list). API integration: [OpenRouter documentation](https://openrouter.ai/docs).

Unofficial fan project, not affiliated with Wizards of the Coast. Magic: The Gathering and card names and text belong to their respective owners. Repository code is provided under the existing GPL-3.0 licence in `LICENSE`; that licence does not grant ownership of third-party card content.
