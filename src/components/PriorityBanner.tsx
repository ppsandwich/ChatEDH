import type { Game } from "../lib/game";

export function PriorityBanner({
  game,
  busy,
  checkingPriority,
  onGoToActions,
}: {
  game: Game;
  busy: boolean;
  checkingPriority: boolean;
  onGoToActions: () => void;
}) {
  if (game.status !== "playing") return null;
  const human = game.priority === "you";
  const ready = human && !busy;
  return (
    <section
      className={`priority-banner ${human ? "human-priority" : "opponent-priority"} ${ready ? "priority-ready" : ""}`}
      aria-label="Priority"
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="priority-message"
      >
        <div className="priority-heading">
          <h2>{human ? "You have priority" : "Opponent has priority"}</h2>
          <span className="priority-state">
            {checkingPriority
              ? "Checking actions"
              : busy
                ? "Resolving action"
                : human
                  ? "Your move"
                  : "Please wait"}
          </span>
        </div>
        <p>
          {checkingPriority
            ? "Checking for legal actions before auto-passing."
            : busy
              ? "Wait for this action to finish resolving."
              : human
                ? "Play a card, activate an ability, or pass priority."
                : "Your response window will appear here when priority returns."}
        </p>
        <span className="priority-turn">
          {game.active === "you" ? "Your turn" : "Opponent’s turn"} ·{" "}
          {game.phase}
        </span>
      </div>
      {ready && (
        <button className="priority-jump" onClick={onGoToActions}>
          Go to actions ↓
        </button>
      )}
    </section>
  );
}
