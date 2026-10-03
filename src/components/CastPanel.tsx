import { useMemo, useState } from "react";
import { definition, type Card, type Game } from "../lib/game";
import { manaPlanSummary, planMana } from "../lib/mana";
import { Mana } from "./CardView";
export type CastRequest = { cardId: string; xValue: number };
export function CastPanel({
  game,
  card,
  autoTap,
  onCast,
}: {
  game: Game;
  card: Card;
  autoTap: boolean;
  onCast: (action: string, request: CastRequest) => void;
}) {
  const [details, setDetails] = useState(""),
    [x, setX] = useState(0);
  const d = definition(card),
    land = d.type.includes("Land") && !d.type.includes("//"),
    hasX = d.manaCost.includes("{X}");
  const plan = useMemo(
    () => (land ? null : planMana(game, card, "you", x)),
    [game, card, x, land],
  );
  return (
    <form
      className="cast-panel"
      onSubmit={(e) => {
        e.preventDefault();
        onCast(
          `${land ? "Play" : "Cast"} ${card.name} [${card.id}]${hasX ? ` with X=${x}` : ""}. ${details.trim()}${autoTap && !land ? " Automatically choose the best legal mana payment." : ""}`,
          { cardId: card.id, xValue: x },
        );
      }}
    >
      {hasX && (
        <label>
          Choose X
          <input
            type="number"
            min={0}
            max={1000}
            step={1}
            value={x}
            required
            onChange={(e) => setX(Number(e.target.value))}
          />
        </label>
      )}
      <label>
        {land ? "Land choices, if needed" : "Targets, modes or other choices"}
        <input
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={
            land
              ? "e.g. pay 2 life to enter untapped"
              : "e.g. target the opponent’s creature"
          }
        />
      </label>
      {!land && autoTap && plan && (
        <div className={`mana-preview ${plan.status}`}>
          <div className="section-heading">
            <strong>
              {plan.status === "ready"
                ? "Suggested payment"
                : "Automatic payment"}
            </strong>
            <Mana cost={plan.cost} />
          </div>
          <p>{manaPlanSummary(plan)}</p>
          {plan.status === "ready" && (
            <small>
              Preserves life, resources and flexible mana. The referee checks
              all effects before payment.
            </small>
          )}
        </div>
      )}
      {!land && !autoTap && (
        <p className="small muted">
          Include your mana payment above, or enable auto-tap at the table.
        </p>
      )}
      <button className="primary cast-submit" type="submit">
        {land ? "Play land" : autoTap ? "Cast with auto-tap" : "Cast spell"}{" "}
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
