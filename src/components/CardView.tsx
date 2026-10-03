import { type Card, type CardDefinition, definition } from "../lib/game";
export function Mana({ cost }: { cost: string }) {
  return (
    <span className="mana-cost" aria-label={cost}>
      {(cost.match(/\{[^}]+\}/g) ?? []).map((x, i) => (
        <span className={`mana-symbol mana-${x.slice(1, -1)}`} key={i}>
          {x.slice(1, -1)}
        </span>
      ))}
    </span>
  );
}
export function CardText({ card }: { card: CardDefinition }) {
  return (
    <>
      <div className="card-title">
        <h3>{card.name}</h3>
        <Mana cost={card.manaCost} />
      </div>
      <p className="type-line">{card.type}</p>
      <p className="oracle">{card.text}</p>
      {(card.power || card.loyalty) && (
        <p className="stats">
          {card.power
            ? `${card.power} / ${card.toughness}`
            : `Loyalty ${card.loyalty}`}
        </p>
      )}
    </>
  );
}
export function CardView({
  card,
  onClick,
  selected = false,
}: {
  card: Card;
  onClick: () => void;
  selected?: boolean;
}) {
  const def = definition(card);
  return (
    <button
      className={`text-card ${card.tapped ? "tapped" : ""} ${selected ? "selected" : ""}`}
      onClick={onClick}
      aria-label={`${card.name}${card.tapped ? ", tapped" : ""}${selected ? ", selected" : ""}`}
      aria-pressed={selected}
    >
      <div className="card-title">
        <strong>{card.name}</strong>
        <Mana cost={def?.manaCost ?? ""} />
      </div>
      <span className="type-line">{def?.type}</span>
      <span className="oracle">{def?.text}</span>
      <span className="card-foot">
        <span>
          {card.tapped
            ? "Tapped"
            : card.commander
              ? "Commander"
              : card.token
                ? "Token"
                : card.zone === "hand"
                  ? "In hand"
                  : card.zone === "battlefield"
                    ? "Ready"
                    : card.zone}
          {card.damage > 0 ? ` · ${card.damage} damage` : ""}
        </span>
        <b>
          {def?.power
            ? `${def.power}/${def.toughness}`
            : def?.loyalty
              ? `L ${def.loyalty}`
              : ""}
        </b>
      </span>
      {Object.entries(card.counters)
        .filter(([, n]) => n !== 0)
        .map(([name, n]) => (
          <span className="counter-label" key={name}>
            {name}: {n}
          </span>
        ))}
      {card.notes && <span className="card-notes">{card.notes}</span>}
    </button>
  );
}
