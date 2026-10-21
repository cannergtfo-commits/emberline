export const UNIT_KINDS = [
  "skirmisher",
  "jugger",
  "outrider",
  "lancer",
  "bastion",
  "hauler",
  "mortar",
  "longshot",
  "ward",
  "kite",
  "wasp",
  "dart",
  "crucible",
  "captain",
] as const;

export type UnitKind = (typeof UNIT_KINDS)[number];
export type MoveClass = "foot" | "boot" | "tires" | "treads" | "copter" | "air";
export type Terrain =
  | "plain"
  | "woods"
  | "ridge"
  | "road"
  | "river"
  | "sea"
  | "shoal"
  | "bridge"
  | "city"
  | "factory"
  | "airport"
  | "hq";
export type PlayerId = 1 | 2 | 3 | 4;
export type CommanderId = "nord" | "vael" | "heart" | "maw" | "aure";

export interface UnitDef {
  kind: UnitKind;
  name: string;
  blurb: string;
  cost: number;
  move: number;
  vision: number;
  moveClass: MoveClass;
  ammo: number;
  fuel: number;
  daily: number;
  range: { min: number; max: number } | null;
  facility: "factory" | "airport" | null;
}

export const UNITS: Record<UnitKind, UnitDef> = {
  skirmisher: {
    kind: "skirmisher",
    name: "Skirmisher",
    blurb: "Foot soldier. Seizes towns and keeps.",
    cost: 1000,
    move: 3,
    vision: 2,
    moveClass: "foot",
    ammo: -1,
    fuel: 99,
    daily: 0,
    range: { min: 1, max: 1 },
    facility: "factory",
  },
  jugger: {
    kind: "jugger",
    name: "Jugger",
    blurb: "Heavy infantry with a shoulder gun. Good against armor.",
    cost: 3000,
    move: 2,
    vision: 2,
    moveClass: "boot",
    ammo: 6,
    fuel: 70,
    daily: 0,
    range: { min: 1, max: 1 },
    facility: "factory",
  },
  outrider: {
    kind: "outrider",
    name: "Outrider",
    blurb: "Fast scout. Spots for the big guns.",
    cost: 4000,
    move: 8,
    vision: 5,
    moveClass: "tires",
    ammo: -1,
    fuel: 80,
    daily: 0,
    range: { min: 1, max: 1 },
    facility: "factory",
  },
  lancer: {
    kind: "lancer",
    name: "Lancer",
    blurb: "Light tank. The everyday spearhead.",
    cost: 7000,
    move: 6,
    vision: 3,
    moveClass: "treads",
    ammo: 9,
    fuel: 70,
    daily: 0,
    range: { min: 1, max: 1 },
    facility: "factory",
  },
  bastion: {
    kind: "bastion",
    name: "Bastion",
    blurb: "Heavy tank. Slow, and very hard to move.",
    cost: 16000,
    move: 5,
    vision: 1,
    moveClass: "treads",
    ammo: 8,
    fuel: 50,
    daily: 0,
    range: { min: 1, max: 1 },
    facility: "factory",
  },
  hauler: {
    kind: "hauler",
    name: "Hauler",
    blurb: "Carries one soldier and resupplies neighbors.",
    cost: 5000,
    move: 6,
    vision: 1,
    moveClass: "tires",
    ammo: 0,
    fuel: 70,
    daily: 0,
    range: null,
    facility: "factory",
  },
  mortar: {
    kind: "mortar",
    name: "Mortar",
    blurb: "Indirect gun, range 2–3. Needs a spotter. Cannot fire after moving.",
    cost: 6000,
    move: 5,
    vision: 1,
    moveClass: "tires",
    ammo: 9,
    fuel: 50,
    daily: 0,
    range: { min: 2, max: 3 },
    facility: "factory",
  },
  longshot: {
    kind: "longshot",
    name: "Longshot",
    blurb: "Rocket carriage, range 3–5. Needs a spotter.",
    cost: 15000,
    move: 5,
    vision: 1,
    moveClass: "tires",
    ammo: 6,
    fuel: 50,
    daily: 0,
    range: { min: 3, max: 5 },
    facility: "factory",
  },
  ward: {
    kind: "ward",
    name: "Ward",
    blurb: "Anti-air tracks. Punishes anything that flies.",
    cost: 8000,
    move: 6,
    vision: 2,
    moveClass: "tires",
    ammo: 9,
    fuel: 60,
    daily: 0,
    range: { min: 1, max: 1 },
    facility: "factory",
  },
  kite: {
    kind: "kite",
    name: "Kite",
    blurb: "Transport rotorcraft. Lifts one soldier over creeks and through forests. Mountains stop it.",
    cost: 5000,
    move: 6,
    vision: 2,
    moveClass: "copter",
    ammo: 0,
    fuel: 60,
    daily: 2,
    range: null,
    facility: "airport",
  },
  wasp: {
    kind: "wasp",
    name: "Wasp",
    blurb: "Attack rotorcraft. Hunts tanks, fears fighters.",
    cost: 9000,
    move: 6,
    vision: 3,
    moveClass: "copter",
    ammo: 6,
    fuel: 60,
    daily: 2,
    range: { min: 1, max: 1 },
    facility: "airport",
  },
  dart: {
    kind: "dart",
    name: "Dart",
    blurb: "Fighter. Owns the sky and nothing else.",
    cost: 20000,
    move: 9,
    vision: 4,
    moveClass: "air",
    ammo: 9,
    fuel: 50,
    daily: 3,
    range: { min: 1, max: 1 },
    facility: "airport",
  },
  crucible: {
    kind: "crucible",
    name: "Crucible",
    blurb: "Bomber. Ruins ground formations. Cannot touch aircraft.",
    cost: 22000,
    move: 7,
    vision: 2,
    moveClass: "air",
    ammo: 6,
    fuel: 50,
    daily: 3,
    range: { min: 1, max: 1 },
    facility: "airport",
  },
  captain: {
    kind: "captain",
    name: "Captain",
    blurb: "Your banner's leader. Grows stronger with each victory, can mend the line, and can be called back after a fall.",
    cost: 9000,
    move: 3,
    vision: 2,
    moveClass: "foot",
    ammo: -1,
    fuel: 99,
    daily: 0,
    range: { min: 1, max: 1 },
    facility: null,
  },
};

/** Base damage at full strength before cover and luck. 0 means cannot strike that target. */
const ROWS: number[][] = [
  [55, 45, 12, 5, 1, 14, 15, 25, 5, 8, 7, 0, 0, 48],
  [65, 55, 85, 55, 15, 75, 70, 85, 65, 12, 22, 0, 0, 58],
  [70, 65, 35, 6, 1, 45, 45, 55, 4, 18, 28, 0, 0, 62],
  [75, 70, 85, 55, 15, 75, 70, 85, 65, 10, 35, 0, 0, 68],
  [105, 95, 105, 85, 55, 105, 105, 105, 95, 20, 45, 0, 0, 90],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [90, 85, 80, 70, 45, 70, 75, 80, 75, 0, 0, 0, 0, 80],
  [95, 90, 90, 80, 55, 80, 85, 90, 85, 0, 0, 0, 0, 85],
  [105, 95, 60, 25, 10, 45, 50, 55, 45, 120, 115, 65, 75, 95],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [70, 65, 75, 55, 25, 65, 65, 75, 25, 65, 55, 0, 0, 60],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 55, 100, 0],
  [110, 100, 105, 105, 90, 105, 105, 105, 95, 0, 0, 0, 0, 100],
  [70, 60, 40, 28, 12, 50, 55, 60, 35, 22, 30, 0, 0, 55],
];

const INDEX: Record<UnitKind, number> = Object.fromEntries(
  UNIT_KINDS.map((k, i) => [k, i]),
) as Record<UnitKind, number>;

export function baseDamage(atk: UnitKind, def: UnitKind): number {
  return ROWS[INDEX[atk]][INDEX[def]];
}

export const MOVE_COST: Record<MoveClass, Record<Terrain, number>> = {
  foot: {
    plain: 1, woods: 1, ridge: 99, road: 1, river: 2, sea: 99, shoal: 1,
    bridge: 1, city: 1, factory: 1, airport: 1, hq: 1,
  },
  boot: {
    plain: 1, woods: 1, ridge: 99, road: 1, river: 1, sea: 99, shoal: 1,
    bridge: 1, city: 1, factory: 1, airport: 1, hq: 1,
  },
  tires: {
    plain: 2, woods: 2, ridge: 99, road: 1, river: 99, sea: 99, shoal: 99,
    bridge: 1, city: 1, factory: 1, airport: 1, hq: 1,
  },
  treads: {
    plain: 1, woods: 2, ridge: 99, road: 1, river: 99, sea: 99, shoal: 99,
    bridge: 1, city: 1, factory: 1, airport: 1, hq: 1,
  },
  copter: {
    plain: 1, woods: 1, ridge: 99, road: 1, river: 1, sea: 1, shoal: 1,
    bridge: 1, city: 1, factory: 1, airport: 1, hq: 1,
  },
  air: {
    plain: 1, woods: 1, ridge: 99, road: 1, river: 1, sea: 1, shoal: 1,
    bridge: 1, city: 1, factory: 1, airport: 1, hq: 1,
  },
};

export const COVER: Record<Terrain, number> = {
  plain: 1,
  woods: 2,
  ridge: 4,
  road: 0,
  river: 0,
  sea: 0,
  shoal: 0,
  bridge: 0,
  city: 3,
  factory: 3,
  airport: 3,
  hq: 4,
};

export const TERRAIN_NAME: Record<Terrain, string> = {
  plain: "Meadow",
  woods: "Forest",
  ridge: "Mountain",
  road: "Track",
  river: "Creek",
  sea: "Deep water",
  shoal: "Shoal",
  bridge: "Bridge",
  city: "Town",
  factory: "Works",
  airport: "Airfield",
  hq: "Keep",
};

export function isProperty(t: Terrain): boolean {
  return t === "city" || t === "factory" || t === "airport" || t === "hq";
}

export function isIndirect(kind: UnitKind): boolean {
  return kind === "mortar" || kind === "longshot";
}

export function isAirClass(cls: MoveClass): boolean {
  return cls === "air" || cls === "copter";
}

export function canCarry(kind: UnitKind): boolean {
  return kind === "hauler" || kind === "kite";
}

export function isPassenger(kind: UnitKind): boolean {
  return kind === "skirmisher" || kind === "jugger" || kind === "captain";
}

export const CAPTAIN_CAP = 6;

const XP_STEP = [0, 30, 45, 65, 90, 120];

export function captainRank(level: number): number {
  return Math.min(CAPTAIN_CAP, Math.max(1, Math.floor(level) || 1));
}

export function xpToNext(level: number): number {
  const rank = captainRank(level);
  return rank >= CAPTAIN_CAP ? 0 : XP_STEP[rank];
}

export function killXp(kind: UnitKind): number {
  return Math.max(8, Math.round(UNITS[kind].cost / 250));
}

export function captainCost(level: number): number {
  return 5000 + (captainRank(level) - 1) * 1000;
}

export function captainMods(level: number): { atk: number; def: number; move: number; vision: number; heal: number } {
  const rank = captainRank(level);
  const steps = rank - 1;
  return {
    atk: 1 + 0.12 * steps,
    def: 1 - 0.06 * steps,
    move: Math.floor(rank / 2),
    vision: Math.floor(steps / 2),
    heal: 20 + 4 * steps,
  };
}

export interface CommanderDef {
  id: CommanderId;
  name: string;
  pact: string;
  power: string;
  blurb: string;
  threshold: number;
}

export const COMMANDERS: Record<CommanderId, CommanderDef> = {
  nord: {
    id: "nord",
    name: "Signe Voss",
    pact: "Nordmark",
    power: "Fjell March",
    blurb: "Wagons and armor roll one tile farther and hit about a third harder until dusk.",
    threshold: 22000,
  },
  heart: {
    id: "heart",
    name: "Cole Harlan",
    pact: "Heartland",
    power: "Homestead",
    blurb: "Foot troops step farther, seize twice as fast, and strike a little harder.",
    threshold: 16000,
  },
  vael: {
    id: "vael",
    name: "Aelith Quen",
    pact: "Vael Synod",
    power: "Still Orbit",
    blurb: "The whole army strikes cleaner and counts one extra cover star.",
    threshold: 20000,
  },
  maw: {
    id: "maw",
    name: "Gorvun",
    pact: "Mawbrood",
    power: "Gore Rain",
    blurb: "Guns and fliers hit much harder. Mortars and rails may fire after moving.",
    threshold: 21000,
  },
  aure: {
    id: "aure",
    name: "Isolde Cael",
    pact: "Aure Choir",
    power: "Ascendant Hymn",
    blurb: "Infantry and winged craft step one tile farther and strike harder until dusk.",
    threshold: 19000,
  },
};

export const COMMANDER_IDS = Object.keys(COMMANDERS) as CommanderId[];

export const UNIT_NAMES: Record<CommanderId, Record<UnitKind, string>> = {
  nord: {
    skirmisher: "Huscarl",
    jugger: "Shieldthane",
    outrider: "Ski-Recon",
    lancer: "Fjord",
    bastion: "Ironhowl",
    hauler: "Wagon",
    mortar: "Snowgun",
    longshot: "Hail Rail",
    ward: "Skyhook",
    kite: "Rook",
    wasp: "Hornet",
    dart: "Falcon",
    crucible: "Condor",
    captain: "Signe",
  },
  vael: {
    skirmisher: "Starblade",
    jugger: "Acolyte",
    outrider: "Needle",
    lancer: "Glass Spear",
    bastion: "Monolith",
    hauler: "Sled",
    mortar: "Prism",
    longshot: "Comet Rail",
    ward: "Glimmer",
    kite: "Skiff",
    wasp: "Stinger",
    dart: "Needlewing",
    crucible: "Nova",
    captain: "Aelith",
  },
  heart: {
    skirmisher: "Rifleman",
    jugger: "Grenadier",
    outrider: "Scout Jeep",
    lancer: "Bulldog",
    bastion: "Ironclad",
    hauler: "Deuce",
    mortar: "Thumper",
    longshot: "Starrocket",
    ward: "Watchdog",
    kite: "Bird",
    wasp: "Viper",
    dart: "Starhawk",
    crucible: "Fortress",
    captain: "Cole",
  },
  maw: {
    skirmisher: "Gnash",
    jugger: "Brute",
    outrider: "Skitter",
    lancer: "Tusk",
    bastion: "Behemoth",
    hauler: "Howdah",
    mortar: "Spitter",
    longshot: "Bile Rail",
    ward: "Spitwing",
    kite: "Carrion",
    wasp: "Mantis",
    dart: "Bat",
    crucible: "Wyrm",
    captain: "Gorvun",
  },
  aure: {
    skirmisher: "Cherub",
    jugger: "Oathguard",
    outrider: "Chariot",
    lancer: "Aurum",
    bastion: "Sanctum",
    hauler: "Ark",
    mortar: "Thurible",
    longshot: "Hymn Rail",
    ward: "Vigil",
    kite: "Herald",
    wasp: "Seraph",
    dart: "Dawnbolt",
    crucible: "Judgment",
    captain: "Isolde",
  },
};

export function unitTitle(faction: CommanderId, kind: UnitKind): string {
  return UNIT_NAMES[faction][kind];
}

export const INCOME = 1000;
export const CAPTURE_MAX = 20;
export const REPAIR_HP = 20;

export const SEAT_NAME: Record<PlayerId, string> = {
  1: "Ember",
  2: "Gale",
  3: "Flint",
  4: "Tide",
};
