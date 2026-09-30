import fs from "node:fs/promises";
// Authored archetype lists, not copies of tournament lists. Priority-ordered pools.
const lines = (s) =>
  s
    .trim()
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const staple = lines(`
Sol Ring
Chrome Mox
Mox Diamond
Mox Opal
Lotus Petal
Mana Vault
Grim Monolith
Arcane Signet
Fellwar Stone
Lion's Eye Diamond
The One Ring
Sensei's Divining Top
Wishclaw Talisman
Defense Grid
Grafdigger's Cage
Pithing Needle
Tormod's Crypt
Winter Orb
`);
const coloured = lines(`
Force of Will
Fierce Guardianship
Force of Negation
Pact of Negation
Flusterstorm
Mental Misstep
Swan Song
An Offer You Can't Refuse
Mystic Remora
Rhystic Study
Mystical Tutor
Brainstorm
Ponder
Preordain
Gitaxian Probe
Spell Pierce
Mana Drain
Chain of Vapor
Cyclonic Rift
Dress Down
Windfall
Timetwister
Narset, Parter of Veils
Demonic Tutor
Vampiric Tutor
Imperial Seal
Ad Nauseam
Necropotence
Dark Ritual
Cabal Ritual
Culling the Weak
Beseech the Mirror
Diabolic Intent
Entomb
Reanimate
Animate Dead
Necromancy
Opposition Agent
Orcish Bowmasters
Dauthi Voidwalker
Thoughtseize
Duress
Peer into the Abyss
Toxic Deluge
Deadly Rollick
Underworld Breach
Gamble
Jeska's Will
Rite of Flame
Simian Spirit Guide
Ragavan, Nimble Pilferer
Pyroblast
Red Elemental Blast
Deflecting Swat
Final Fortune
Wheel of Fortune
Faithless Looting
Seething Song
Silence
Swords to Plowshares
Enlightened Tutor
Ranger-Captain of Eos
Esper Sentinel
Drannith Magistrate
Grand Abolisher
Smothering Tithe
Sevinne's Reclamation
Archivist of Oghma
Deafening Silence
Aven Mindcensor
Touch the Spirit Realm
Worldly Tutor
Eladamri's Call
Green Sun's Zenith
Finale of Devastation
Birds of Paradise
Llanowar Elves
Elvish Mystic
Fyndhorn Elves
Delighted Halfling
Elvish Spirit Guide
Carpet of Flowers
Sylvan Library
Veil of Summer
Nature's Claim
Force of Vigor
Collector Ouphe
Eternal Witness
Noxious Revival
Crop Rotation
Endurance
Survival of the Fittest
Abrupt Decay
Assassin's Trophy
Deathrite Shaman
Lotho, Corrupt Shirriff
Faerie Mastermind
Ledger Shredder
Dispel
Negate
Counterspell
Misdirection
Spell Snare
Resculpt
Rapid Hybridization
Pongify
Merchant Scroll
Fabricate
Muddle the Mixture
Snap
Delay
Dismember
Walking Ballista
Basalt Monolith
Voltaic Key
Manifold Key
Aether Spellbomb
Moonsilver Key
Cursed Totem
Trinisphere
Thorn of Amethyst
Sphere of Resistance
Tangle Wire
Mind Stone
Thought Vessel
Liquimetal Torque
Springleaf Drum
Paradise Mantle
Everflowing Chalice
Expedition Map
Sculpting Steel
Mirage Mirror
`);
const landPool = lines(`
Command Tower
City of Brass
Mana Confluence
Exotic Orchard
Gemstone Caverns
Ancient Tomb
Urza's Saga
Forbidden Orchard
Gemstone Mine
Reflecting Pool
Otawara, Soaring City
Boseiju, Who Endures
Takenuma, Abandoned Mire
Eiganjo, Seat of the Empire
Sokenzan, Crucible of Defiance
Underground Sea
Volcanic Island
Tropical Island
Tundra
Badlands
Bayou
Scrubland
Savannah
Taiga
Plateau
Watery Grave
Steam Vents
Breeding Pool
Hallowed Fountain
Blood Crypt
Overgrown Tomb
Godless Shrine
Temple Garden
Stomping Ground
Sacred Foundry
Polluted Delta
Flooded Strand
Scalding Tarn
Misty Rainforest
Verdant Catacombs
Marsh Flats
Bloodstained Mire
Wooded Foothills
Windswept Heath
Arid Mesa
Undercity Sewers
Meticulous Archive
Thundering Falls
Underground River
Yavimaya Coast
Shivan Reef
Adarkar Wastes
Darkslick Shores
Spirebluff Canal
Botanical Sanctum
Spire of Industry
Inventors' Fair
Emergence Zone
Cephalid Coliseum
Gaea's Cradle
Phyrexian Tower
`);
const specs = [
  {
    id: "kinnan",
    name: "Kinnan",
    commanders: ["Kinnan, Bonder Prodigy"],
    colours: ["U", "G"],
    style: "Infinite mana",
    description:
      "Turn mana creatures and rocks into an engine. Find Basalt Monolith, then convert infinite mana into a decisive board.",
    core: lines(`Basalt Monolith
Freed from the Real
Pemmin's Aura
Bloom Tender
Incubation Druid
Noble Hierarch
Thrasios, Triton Hero
Hullbreaker Horror
Tidespout Tyrant
Seedborn Muse
Consecrated Sphinx
Koma, Cosmos Serpent
Nyxbloom Ancient
Trophy Mage
Transmute Artifact
Reshape
Neoform
Eldritch Evolution
Mox Amber
Springleaf Drum`),
    lands: 30,
  },
  {
    id: "rogsi",
    name: "RogSi",
    commanders: ["Rograkh, Son of Rohgahh", "Silas Renn, Seeker Adept"],
    colours: ["U", "B", "R"],
    style: "Turbo combo",
    description:
      "Explosive rituals and a free commander power Ad Nauseam, Oracle, and Underworld Breach wins.",
    core: lines(`Thassa's Oracle
Demonic Consultation
Tainted Pact
Brain Freeze
Underworld Breach
Ad Nauseam
Culling the Weak
Infernal Plunge
Mox Amber
Springleaf Drum
Wishclaw Talisman
Praetor's Grasp
Defense Grid
Borne Upon a Wind
Final Fortune`),
    lands: 28,
  },
  {
    id: "blue-farm",
    name: "Blue Farm",
    commanders: ["Tymna the Weaver", "Kraum, Ludevic's Opus"],
    colours: ["W", "U", "B", "R"],
    style: "Midrange combo",
    description:
      "Trade efficiently, refill with your commanders, and pivot into an Oracle or Breach finish.",
    core: lines(`Thassa's Oracle
Demonic Consultation
Tainted Pact
Underworld Breach
Brain Freeze
Ad Nauseam
Ranger-Captain of Eos
Esper Sentinel
Orcish Bowmasters
Lotho, Corrupt Shirriff
Silence
Grand Abolisher
Sevinne's Reclamation
Mnemonic Betrayal
Borne Upon a Wind`),
    lands: 29,
  },
  {
    id: "yuriko",
    name: "Yuriko",
    commanders: ["Yuriko, the Tiger's Shadow"],
    colours: ["U", "B"],
    style: "Tempo",
    description:
      "Slip evasive creatures through combat, draw with ninjas, and turn the top of your library into damage.",
    core: lines(`Thassa's Oracle
Demonic Consultation
Tainted Pact
Changeling Outcast
Universal Automaton
Ornithopter
Memnite
Gingerbrute
Triton Shorestalker
Slither Blade
Faerie Seer
Moon-Circuit Hacker
Ingenious Infiltrator
Ninja of the Deep Hours
Sakashima's Student
Thousand-Faced Shadow
Prosperous Thief
Mist-Syndicate Naga
Temporal Trespass
Dig Through Time
Treasure Cruise
Shadow of Mortality
Snuff Out
Deadly Rollick
Lim-Dûl's Vault
Scroll Rack`),
    lands: 30,
  },
  {
    id: "magda",
    name: "Magda",
    commanders: ["Magda, Brazen Outlaw"],
    colours: ["R"],
    style: "Artifact combo",
    description:
      "Tap dwarves for Treasures, assemble Clock of Omens, and tutor a finish directly onto the battlefield.",
    core: lines(`Clock of Omens
Universal Automaton
Bloodline Pretender
Metallic Mimic
Roaming Throne
Dwarven Armorer
Dwarven Bloodboiler
Dwarven Grunt
Dwarven Scorcher
Dwarven Trader
Vault Robber
Rimrock Knight
Seven Dwarves
Fearless Liberator
Dwarven Mine
Maskwood Nexus
Liquimetal Coating
Liquimetal Torque
Springleaf Drum
Paradise Mantle
Relic of Legends
Smuggler's Copter
Unlicensed Hearse
Clown Car
Portal to Phyrexia
Terror of the Peaks
Goblin Engineer
Goblin Welder
Grinding Station
Staff of Domination
Soul-Guide Lantern
Welding Jar
Mox Amber
Professional Face-Breaker
God-Pharaoh's Statue
Xorn
Ashnod's Transmogrant
Pyrite Spellbomb
Magus of the Moon`),
    lands: 30,
  },
  {
    id: "sisay",
    name: "Sisay",
    commanders: ["Sisay, Weatherlight Captain"],
    colours: ["W", "U", "B", "R", "G"],
    style: "Legendary toolbox",
    description:
      "Build Sisay’s power and mana, then chain legendary permanents into a protected combo.",
    core: lines(`Emiel the Blessed
Bloom Tender
Faeburrow Elder
Selvala, Heart of the Wilds
Derevi, Empyrial Tactician
Kinnan, Bonder Prodigy
Najeela, the Blade-Blossom
Dihada, Binder of Wills
Aminatou, the Fateshifter
Oath of Teferi
Nicol Bolas, Dragon-God
Teferi, Time Raveler
Mox Amber
Relic of Legends
Rona, Herald of Invasion
Tyvar, Jubilant Brawler
Samut, Voice of Dissent
Jegantha, the Wellspring
Captain Sisay
Drannith Magistrate
Silence
Grand Abolisher`),
    lands: 29,
  },
  {
    id: "najeela",
    name: "Najeela",
    commanders: ["Najeela, the Blade-Blossom"],
    colours: ["W", "U", "B", "R", "G"],
    style: "Combat combo",
    description:
      "Pressure life totals with Warriors while threatening repeated combat steps and an Oracle backup.",
    core: lines(`Derevi, Empyrial Tactician
Druids' Repository
Nature's Will
Grim Hireling
Professional Face-Breaker
Bear Umbra
Thassa's Oracle
Demonic Consultation
Tainted Pact
Bloom Tender
Faeburrow Elder
Noble Hierarch
Ignoble Hierarch
Silence
Ranger-Captain of Eos
Esper Sentinel
Grand Abolisher
Sevinne's Reclamation`),
    lands: 30,
  },
  {
    id: "tivit",
    name: "Tivit",
    commanders: ["Tivit, Seller of Secrets"],
    colours: ["W", "U", "B"],
    style: "Control combo",
    description:
      "Use interaction to reach Tivit, then exploit artifacts and blink effects. Time Sieve needs extra fodder in a duel.",
    core: lines(`Time Sieve
Displacer Kitten
Teferi, Time Raveler
Thassa's Oracle
Demonic Consultation
Tainted Pact
Transmute Artifact
Mox Amber
Smothering Tithe
Wishclaw Talisman
Deadeye Navigator
Ephemerate
Touch the Spirit Realm
Lotho, Corrupt Shirriff
Esper Sentinel
Silence
Grand Abolisher
Praetor's Grasp`),
    lands: 31,
  },
  {
    id: "talion",
    name: "Talion",
    commanders: ["Talion, the Kindly Lord"],
    colours: ["U", "B"],
    style: "Draw-go control",
    description:
      "Keep mana open, trade on the stack, and use Talion’s card advantage to protect an Oracle finish.",
    core: lines(`Thassa's Oracle
Demonic Consultation
Tainted Pact
Bloodchief Ascension
Mindcrank
Mnemonic Betrayal
Sheoldred, the Apocalypse
Notion Thief
Windfall
Orcish Bowmasters
Opposition Agent
Dauthi Voidwalker
Borne Upon a Wind
Dress Down
Praetor's Grasp
Lim-Dûl's Vault`),
    lands: 31,
  },
  {
    id: "niv",
    name: "Niv-Mizzet",
    commanders: ["Niv-Mizzet, Parun"],
    colours: ["U", "R"],
    style: "Curiosity control",
    description:
      "Protect Niv-Mizzet and pair him with a Curiosity effect to turn every card drawn into another point of damage.",
    core: lines(`Curiosity
Ophidian Eye
Tandem Lookout
Birgi, God of Storytelling
Storm-Kiln Artist
Archmage Emeritus
Baral, Chief of Compliance
Goblin Electromancer
Izzet Signet
Talisman of Creativity
Curse of Opulence
Underworld Breach
Brain Freeze
High Tide
Snap
Frantic Search
Desperate Ritual
Pyretic Ritual
Mana Geyser
Gilded Lotus
Chromatic Lantern
Training Center`),
    lands: 33,
  },
  {
    id: "thrasios-tymna",
    name: "Thrasios & Tymna",
    commanders: ["Thrasios, Triton Hero", "Tymna the Weaver"],
    colours: ["W", "U", "B", "G"],
    style: "Value combo",
    description:
      "Develop a resilient mana engine and trade resources, with Thrasios available as an infinite-mana outlet.",
    core: lines(`Thassa's Oracle
Demonic Consultation
Tainted Pact
Devoted Druid
Swift Reconfiguration
Vizier of Remedies
Bloom Tender
Freed from the Real
Seedborn Muse
Kinnan, Bonder Prodigy
Basalt Monolith
Noble Hierarch
Training Grounds
Neoform
Eldritch Evolution
Silence
Grand Abolisher
Esper Sentinel
Ranger-Captain of Eos`),
    lands: 30,
  },
  {
    id: "winota",
    name: "Winota",
    commanders: ["Winota, Joiner of Forces"],
    colours: ["W", "R"],
    style: "Stax & combat",
    description:
      "Deploy disruptive Humans through Winota triggers, then close with a wide, difficult-to-answer attack.",
    core: lines(`Ornithopter
Memnite
Gingerbrute
Ragavan, Nimble Pilferer
Legion Warboss
Goblin Rabblemaster
Loyal Apprentice
Signal Pest
Hope of Ghirapur
Simian Spirit Guide
Phyrexian Walker
Selfless Spirit
Archon of Emeria
Ethersworn Canonist
Eidolon of Rhetoric
Thalia, Guardian of Thraben
Thalia, Heretic Cathar
Sanctum Prelate
Drannith Magistrate
Magus of the Moon
Blade Historian
Angrath's Marauders
Greymond, Avacyn's Stalwart
Combat Celebrant
Kiki-Jiki, Mirror Breaker
Zealous Conscripts
Village Bell-Ringer
Imperial Recruiter
Recruiter of the Guard
Aven Mindcensor
Spirit of the Labyrinth
Mother of Runes
Giver of Runes
Dauntless Dismantler
Containment Priest
Boromir, Warden of the Tower
Loran of the Third Path
Vryn Wingmare
Tocatli Honor Guard
Cavern of Souls
Ancient Ziggurat`),
    lands: 31,
  },
];
let cache = {};
try {
  cache = JSON.parse(await fs.readFile("scripts/card-cache.json", "utf8"));
} catch {}
const names = [
  ...new Set([
    ...staple,
    ...coloured,
    ...landPool,
    ...specs.flatMap((x) => [...x.commanders, ...x.core]),
    "Plains",
    "Island",
    "Swamp",
    "Mountain",
    "Forest",
  ]),
];
for (let i = 0; i < names.length; i += 70) {
  const missing = names.slice(i, i + 70).filter((n) => !cache[n]);
  if (!missing.length) continue;
  const res = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ChatEDH/0.1 (local deck builder)",
      Accept: "application/json",
    },
    body: JSON.stringify({ identifiers: missing.map((name) => ({ name })) }),
  });
  if (!res.ok) throw new Error(`Scryfall ${res.status}`);
  const body = await res.json();
  if (body.not_found?.length) console.log("Not found", body.not_found);
  for (const c of body.data) {
    const faces = c.card_faces;
    const item = {
      name: c.name,
      manaCost: c.mana_cost ?? faces?.[0]?.mana_cost ?? "",
      manaValue: c.cmc,
      type: c.type_line,
      text:
        c.oracle_text ??
        faces?.map((f) => `${f.name}\n${f.oracle_text}`).join("\n\n") ??
        "",
      colours: c.color_identity,
      power: c.power ?? faces?.[0]?.power,
      toughness: c.toughness ?? faces?.[0]?.toughness,
      loyalty: c.loyalty,
      legal: c.legalities.commander === "legal",
      scryfallUrl: c.scryfall_uri,
    };
    cache[c.name] = item;
    for (const n of missing) if (c.name.split(" // ")[0] === n) cache[n] = item;
  }
  await fs.writeFile("scripts/card-cache.json", JSON.stringify(cache, null, 2));
  await new Promise((r) => setTimeout(r, 150));
}
const basic = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};
const fetchTypes = {
  "Polluted Delta": ["U", "B"],
  "Flooded Strand": ["W", "U"],
  "Scalding Tarn": ["U", "R"],
  "Misty Rainforest": ["U", "G"],
  "Verdant Catacombs": ["B", "G"],
  "Marsh Flats": ["W", "B"],
  "Bloodstained Mire": ["B", "R"],
  "Wooded Foothills": ["R", "G"],
  "Windswept Heath": ["W", "G"],
  "Arid Mesa": ["R", "W"],
};
const priority = lines(`
Force of Will
Mystic Remora
Rhystic Study
Fierce Guardianship
Demonic Tutor
Vampiric Tutor
Imperial Seal
Birds of Paradise
Delighted Halfling
Worldly Tutor
Silence
Enlightened Tutor
Esper Sentinel
Gamble
Pyroblast
Red Elemental Blast
Deflecting Swat
Dark Ritual
Orcish Bowmasters
Opposition Agent
Veil of Summer
Carpet of Flowers
Elvish Mystic
Llanowar Elves
Fyndhorn Elves
Swords to Plowshares
Ranger-Captain of Eos
Drannith Magistrate
Flusterstorm
Mental Misstep
Pact of Negation
Swan Song
Mystical Tutor
Underworld Breach
Jeska's Will
Ragavan, Nimble Pilferer
Ad Nauseam
Culling the Weak
Cabal Ritual
Diabolic Intent
Eladamri's Call
Finale of Devastation
Green Sun's Zenith
Sylvan Library
Nature's Claim
Grand Abolisher
Lotho, Corrupt Shirriff
Sevinne's Reclamation
Chain of Vapor
Force of Negation
An Offer You Can't Refuse
Brainstorm
Ponder
Gitaxian Probe
Rite of Flame
Simian Spirit Guide
Elvish Spirit Guide
Dauthi Voidwalker
Necropotence
Toxic Deluge
`);
const decks = specs.map((s) => {
  const fits = (n) =>
    cache[n]?.legal &&
    cache[n].colours.every((c) => s.colours.includes(c)) &&
    !s.commanders.includes(n);
  const isLand = (n) =>
    cache[n].type.includes("Land") && !cache[n].type.includes("//");
  const noSynergy = new Set([
    "Grafdigger's Cage",
    "Collector Ouphe",
    "Cursed Totem",
    "Winter Orb",
    "Tormod's Crypt",
    "Pithing Needle",
    "Thorn of Amethyst",
    "Sphere of Resistance",
    "Trinisphere",
    "Tangle Wire",
  ]);
  if (s.id === "winota") {
    noSynergy.add("Tocatli Honor Guard");
    noSynergy.add("Containment Priest");
  }
  if (!["rogsi", "blue-farm", "niv"].includes(s.id))
    noSynergy.add("Lion's Eye Diamond");
  const core = s.core.filter((n) => fits(n) && !noSynergy.has(n));
  const spells = [
    ...new Set([
      ...core.filter((n) => !isLand(n)),
      ...staple.slice(0, 8).filter((n) => fits(n) && !noSynergy.has(n)),
      ...priority.filter((n) => fits(n) && !noSynergy.has(n)),
      ...staple.filter((n) => fits(n) && !noSynergy.has(n)),
      ...coloured.filter((n) => fits(n) && !noSynergy.has(n)),
    ]),
  ].slice(0, 100 - s.commanders.length - s.lands);
  if (spells.length < 100 - s.commanders.length - s.lands)
    throw new Error(`Not enough spells ${s.id} ${spells.length}`);
  // Select fetches before duals; include only fetches with a valid basic land target.
  const fetches = Object.keys(fetchTypes).filter((n) =>
    fetchTypes[n].some((c) => s.colours.includes(c)),
  );
  const nonbasics = [
    ...new Set([
      ...core.filter(isLand),
      ...landPool.slice(0, 15).filter(fits),
      ...fetches,
      ...landPool.slice(15).filter((n) => !fetchTypes[n] && fits(n)),
    ]),
  ];
  // Leave room for basics, especially for one- and two-colour decks.
  const lands = nonbasics.slice(
    0,
    s.lands - (s.colours.length === 1 ? 16 : s.colours.length === 2 ? 4 : 1),
  );
  for (let i = 0; lands.length < s.lands; i++)
    lands.push(basic[s.colours[i % s.colours.length]]);
  // Tainted Pact requires uniquely named cards. Replace duplicate basics with available nonbasics.
  if (spells.includes("Tainted Pact"))
    for (let i = 0; i < lands.length; i++)
      if (lands.indexOf(lands[i]) !== i) {
        const n = nonbasics.find((n) => !lands.includes(n));
        if (n) lands[i] = n;
      }
  const cards = [...s.commanders, ...spells, ...lands].map((n) => cache[n]);
  const { core: _, ...meta } = s;
  return {
    ...meta,
    cards: cards.map((c) => c.name),
    source: "ChatEDH curated archetype",
    reference: "https://cedh-decklist-database.com/",
    verifiedAt: new Date().toISOString().slice(0, 10),
  };
});
const used = new Set(decks.flatMap((d) => d.cards));
const cards = Object.fromEntries(
  Object.values(cache)
    .filter((c) => used.has(c.name))
    .map((c) => [c.name, c]),
);
await fs.writeFile("src/data/decks.json", JSON.stringify(decks, null, 2));
await fs.writeFile("src/data/cards.json", JSON.stringify(cards, null, 2));
console.log(`Built ${decks.length} decks, ${used.size} cards.`);
